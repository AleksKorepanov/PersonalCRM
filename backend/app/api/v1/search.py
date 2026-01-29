from __future__ import annotations

from typing import Any, Dict, List, Optional

import os

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.deps import get_db, get_current_user, get_workspace_context
from app.core.security import UserPrincipal
from app.services import contacts as contacts_svc
from app.services import introductions as introductions_svc
from app.services import projects as projects_svc
from app.services.db import fetchall

router = APIRouter()


def _has_permission(conn, ctx, user: UserPrincipal, permission_key: str) -> bool:
    if ctx.membership_role == "owner":
        return True
    row = conn.execute(
        """
        SELECT 1
        FROM membership_roles mr
        JOIN workspace_role_permissions wrp ON wrp.role_id = mr.role_id
        WHERE mr.workspace_id = %s AND mr.user_id = %s AND wrp.permission_key = %s
        LIMIT 1
        """,
        (ctx.workspace_id, user.user_id, permission_key),
    ).fetchone()
    if row:
        return True
    if ctx.membership_role in {"assistant", "collaborator"}:
        if permission_key.endswith(".read"):
            return True
        if permission_key == "interactions.write":
            return True
    return False


@router.get("/search")
def global_search(
    q: str = Query(..., min_length=2),
    workspace_id: str = Query(..., alias="workspace_id"),
    limit: int = Query(5, ge=1, le=50),
    conn=Depends(get_db),
    user=Depends(get_current_user),
    ctx=Depends(get_workspace_context),
):
    if os.getenv("SEARCH_ENABLED") != "1":
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Поиск отключен"})

    results: Dict[str, Any] = {"contacts": [], "projects": [], "introductions": []}
    query_like = f"%{q}%"

    if _has_permission(conn, ctx, user, "contacts.read"):
        params: List[Any] = [ctx.workspace_id, q, query_like, query_like, query_like, limit]
        visibility_filter = ""
        if ctx.membership_role != "owner":
            visibility_filter = " AND c.visibility <> 'private' "
        sql = f"""
            SELECT
              c.*,
              o.id as org_id,
              o.name as org_name,
              o.website as org_website,
              o.industry as org_industry,
              o.created_at as org_created_at,
              o.updated_at as org_updated_at
            FROM contacts c
            LEFT JOIN organizations o ON o.id = c.organization_id
            WHERE c.workspace_id = %s
              AND c.deleted_at IS NULL
              {visibility_filter}
              AND (
                c.search_tsv @@ websearch_to_tsquery('simple', %s)
                OR EXISTS (
                  SELECT 1 FROM jsonb_array_elements_text(c.emails) e WHERE e ILIKE %s
                )
                OR EXISTS (
                  SELECT 1 FROM jsonb_array_elements_text(c.phones) p WHERE p ILIKE %s
                )
                OR o.name ILIKE %s
              )
            ORDER BY c.updated_at DESC, c.id DESC
            LIMIT %s
        """
        rows = fetchall(conn, sql, tuple(params))
        results["contacts"] = [contacts_svc._row_to_contact(conn, r, ctx) for r in rows]

    if _has_permission(conn, ctx, user, "projects.manage"):
        items, _ = projects_svc.list_projects(conn, ctx, q=q, limit=limit, cursor=None)
        results["projects"] = items

    if _has_permission(conn, ctx, user, "introductions.manage"):
        where = ["i.workspace_id = %s", "i.deleted_at IS NULL"]
        params_intro: List[Any] = [ctx.workspace_id]
        if ctx.membership_role != "owner":
            where.append("i.visibility <> 'private'")
            where.append(
                "("
                "c_req.visibility IS NULL OR c_req.visibility <> 'private'"
                ") AND ("
                "c_intro.visibility IS NULL OR c_intro.visibility <> 'private'"
                ") AND ("
                "c_tgt.visibility IS NULL OR c_tgt.visibility <> 'private'"
                ")"
            )

        where.append(
            "("
            "i.request_text ILIKE %s OR i.benefit_a ILIKE %s OR i.benefit_b ILIKE %s "
            "OR c_req.display_name ILIKE %s OR c_intro.display_name ILIKE %s OR c_tgt.display_name ILIKE %s"
            ")"
        )
        params_intro.extend([query_like] * 6)

        sql_intro = """
            SELECT
              i.*,
              c_req.display_name as requester_name,
              c_intro.display_name as introducer_name,
              c_tgt.display_name as target_name,
              c_req.visibility AS requester_visibility,
              c_intro.visibility AS introducer_visibility,
              c_tgt.visibility AS target_visibility
            FROM introductions i
            LEFT JOIN contacts c_req ON c_req.id = i.requester_contact_id AND c_req.deleted_at IS NULL
            LEFT JOIN contacts c_intro ON c_intro.id = i.introducer_contact_id AND c_intro.deleted_at IS NULL
            LEFT JOIN contacts c_tgt ON c_tgt.id = i.target_contact_id AND c_tgt.deleted_at IS NULL
            WHERE
        """ + " AND ".join(where) + " ORDER BY i.created_at DESC, i.id DESC LIMIT %s"
        params_intro.append(limit)
        rows = fetchall(conn, sql_intro, tuple(params_intro))
        intro_items = []
        for r in rows:
            intro = introductions_svc._row_to_intro(r, ctx)
            intro_items.append(
                {
                    **intro,
                    "requester_name": r.get("requester_name"),
                    "introducer_name": r.get("introducer_name"),
                    "target_name": r.get("target_name"),
                }
            )
        results["introductions"] = intro_items

    return results
