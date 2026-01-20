from __future__ import annotations

import json
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException

from app.core.security import UserPrincipal
from app.core.deps import WorkspaceContext
from app.schemas.contacts import Contact, ContactCreate, ContactUpdate
from app.schemas.enums import Visibility
from app.schemas.organizations import Organization
from app.services.db import execute, execute_returning_one, fetchall, fetchone
from app.utils.pagination import decode_cursor, encode_cursor, next_cursor_if_any


def _redact_contact_dict(data: Dict[str, Any], ctx: WorkspaceContext) -> Dict[str, Any]:
    if ctx.membership_role != "owner":
        # assistant/collaborator: redact sensitive fields
        data["private_notes"] = None
        data["trust_score"] = None
        data["emotional_balance"] = None
    return data


def _ensure_tags(conn, workspace_id: str, tag_names: List[str]) -> None:
    if not tag_names:
        return
    # Deduplicate and normalize minimal
    names = sorted({t.strip() for t in tag_names if t and t.strip()})
    if not names:
        return
    for name in names:
        execute(
            conn,
            "INSERT INTO tags(workspace_id, name) VALUES (%s, %s) ON CONFLICT (workspace_id, name) DO NOTHING",
            (workspace_id, name),
        )


def _set_contact_tags(conn, workspace_id: str, contact_id: str, tag_names: List[str]) -> List[str]:
    # Replace semantics
    execute(conn, "DELETE FROM contact_tags WHERE contact_id = %s", (contact_id,))
    _ensure_tags(conn, workspace_id, tag_names)
    names = sorted({t.strip() for t in tag_names if t and t.strip()})
    if not names:
        return []

    tag_rows = fetchall(
        conn,
        "SELECT id, name FROM tags WHERE workspace_id = %s AND name = ANY(%s)",
        (workspace_id, names),
    )
    for tr in tag_rows:
        execute(
            conn,
            "INSERT INTO contact_tags(contact_id, tag_id) VALUES (%s, %s) ON CONFLICT DO NOTHING",
            (contact_id, tr["id"]),
        )
    return [tr["name"] for tr in tag_rows]


def _get_tag_names(conn, contact_id: str) -> List[str]:
    rows = fetchall(
        conn,
        """
        SELECT t.name
        FROM contact_tags ct
        JOIN tags t ON t.id = ct.tag_id
        WHERE ct.contact_id = %s
        ORDER BY t.name
        """,
        (contact_id,),
    )
    return [r["name"] for r in rows]


def _organization_from_joined(row: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    if not row.get("org_id"):
        return None
    industries = []
    # DB stores a single industry string; contract expects array
    if row.get("org_industry"):
        industries = [row["org_industry"]]
    return {
        "id": str(row["org_id"]),
        "workspace_id": str(row["workspace_id"]),
        "name": row.get("org_name"),
        "website": row.get("org_website"),
        "industries": industries,
        "created_at": row.get("org_created_at").isoformat() if row.get("org_created_at") else None,
        "updated_at": row.get("org_updated_at").isoformat() if row.get("org_updated_at") else None,
    }


def _row_to_contact(conn, row: Dict[str, Any], ctx: WorkspaceContext) -> Dict[str, Any]:
    # Visibility enforcement
    if ctx.membership_role != "owner" and row.get("visibility") == "private":
        raise HTTPException(status_code=403, detail={"code": "FORBIDDEN", "message": "Private record"})

    context = row.get("context") or {}

    data = {
        "id": str(row["id"]),
        "workspace_id": str(row["workspace_id"]),
        "visibility": row.get("visibility") or "shared",
        "first_name": row.get("first_name"),
        "last_name": row.get("last_name"),
        "middle_name": row.get("middle_name"),
        "display_name": row.get("display_name"),
        "photo_url": row.get("photo_url"),
        "emails": row.get("emails") or [],
        "phones": row.get("phones") or [],
        "messengers": row.get("messengers") or {},
        "city": row.get("city"),
        "timezone": row.get("timezone"),
        "birthday": row.get("birthday").isoformat() if row.get("birthday") else None,
        "organization": _organization_from_joined(row),
        "job_title": row.get("job_title"),
        "industries": row.get("industries") or [],
        "competencies": row.get("competencies") or [],
        "tags": _get_tag_names(conn, str(row["id"])),
        "tie_strength": row.get("tie_strength") or "medium",
        "trust_score": row.get("trust_score"),
        "emotional_balance": row.get("emotional_balance"),
        "how_can_help": context.get("how_can_help") or [],
        "how_i_can_help": context.get("how_i_can_help") or [],
        "met_context": row.get("met_where"),
        "shared_notes": row.get("notes_shared"),
        "private_notes": row.get("notes_private"),
        "last_interaction_at": row.get("last_interaction_at").isoformat() if row.get("last_interaction_at") else None,
        "next_touch_at": row.get("next_touch_at").isoformat() if row.get("next_touch_at") else None,
        "created_at": row.get("created_at").isoformat(),
        "updated_at": row.get("updated_at").isoformat(),
    }
    return _redact_contact_dict(data, ctx)


def list_contacts(
    conn,
    ctx: WorkspaceContext,
    limit: int = 50,
    cursor: Optional[str] = None,
    q: Optional[str] = None,
    tags: Optional[List[str]] = None,
    tier: Optional[str] = None,
    visibility: Optional[str] = None,
    updated_since: Optional[str] = None,
    sort: str = "updated_desc",
) -> Tuple[List[Dict[str, Any]], Optional[str]]:
    params: List[Any] = [ctx.workspace_id]
    where = ["c.workspace_id = %s", "c.deleted_at IS NULL"]

    if ctx.membership_role != "owner":
        where.append("c.visibility <> 'private'")

    if tier:
        where.append("c.tie_strength = %s")
        params.append(tier)

    if visibility:
        where.append("c.visibility = %s")
        params.append(visibility)

    if updated_since:
        where.append("c.updated_at > %s")
        params.append(updated_since)

    join_tags = False
    if tags:
        join_tags = True
        where.append("t.name = ANY(%s)")
        params.append(tags)

    if q:
        where.append("c.search_tsv @@ websearch_to_tsquery('simple', %s)")
        params.append(q)

    order_by = "c.updated_at DESC, c.id DESC"
    cursor_filter = None

    if sort == "last_interaction_desc":
        order_by = "c.last_interaction_at DESC NULLS LAST, c.id DESC"
    elif sort == "name_asc":
        order_by = "c.display_name ASC, c.id ASC"

    if cursor:
        c = decode_cursor(cursor)
        if sort == "name_asc":
            cursor_filter = "(c.display_name, c.id) > (%s, %s)"
            params.extend([c["display_name"], c["id"]])
        elif sort == "last_interaction_desc":
            cursor_filter = "(coalesce(c.last_interaction_at,'epoch'::timestamptz), c.id) < (%s, %s)"
            params.extend([c["last_interaction_at"], c["id"]])
        else:
            cursor_filter = "(c.updated_at, c.id) < (%s, %s)"
            params.extend([c["updated_at"], c["id"]])
        where.append(cursor_filter)

    sql = """
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
    """

    if join_tags:
        sql += " JOIN contact_tags ct ON ct.contact_id = c.id JOIN tags t ON t.id = ct.tag_id "

    sql += " WHERE " + " AND ".join(where) + f" ORDER BY {order_by} LIMIT %s"
    params.append(limit)

    rows = fetchall(conn, sql, tuple(params))
    data = [_row_to_contact(conn, r, ctx) for r in rows]

    next_cur = None
    if len(rows) == limit:
        last = rows[-1]
        if sort == "name_asc":
            next_cur = encode_cursor({"display_name": last["display_name"], "id": str(last["id"])})
        elif sort == "last_interaction_desc":
            last_ts = last.get("last_interaction_at")
            next_cur = encode_cursor({"last_interaction_at": last_ts.isoformat() if last_ts else "epoch", "id": str(last["id"])})
        else:
            next_cur = encode_cursor({"updated_at": last["updated_at"].isoformat(), "id": str(last["id"])})

    return data, next_cur


def create_contact(conn, ctx: WorkspaceContext, user: UserPrincipal, payload: ContactCreate) -> Dict[str, Any]:
    row = execute_returning_one(
        conn,
        """
        INSERT INTO contacts(
          workspace_id, visibility, first_name, last_name, middle_name, display_name, photo_url,
          emails, phones, messengers, city, timezone, birthday,
          organization_id, job_title, industries, competencies,
          tie_strength, trust_score, emotional_balance,
          notes_shared, notes_private, met_where, next_touch_at,
          context, created_by, updated_by
        ) VALUES (
          %s,%s,%s,%s,%s,%s,%s,
          %s,%s,%s,%s,%s,%s,
          %s,%s,%s,%s,
          %s,%s,%s,
          %s,%s,%s,%s,
          %s,%s,%s
        ) RETURNING id
        """,
        (
            ctx.workspace_id,
            payload.visibility.value,
            payload.first_name,
            payload.last_name,
            payload.middle_name,
            payload.display_name,
            payload.photo_url,
            payload.emails,
            payload.phones,
            payload.messengers,
            payload.city,
            payload.timezone,
            payload.birthday,
            payload.organization_id,
            payload.job_title,
            payload.industries,
            payload.competencies,
            payload.tie_strength.value,
            payload.trust_score,
            payload.emotional_balance,
            payload.shared_notes,
            payload.private_notes,
            payload.met_context,
            payload.next_touch_at,
            {"how_can_help": payload.how_can_help, "how_i_can_help": payload.how_i_can_help},
            user.user_id,
            user.user_id,
        ),
    )

    contact_id = str(row["id"])
    _set_contact_tags(conn, ctx.workspace_id, contact_id, payload.tags)
    conn.commit()
    return get_contact(conn, ctx, contact_id)


def get_contact(conn, ctx: WorkspaceContext, contact_id: str) -> Dict[str, Any]:
    row = fetchone(
        conn,
        """
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
        WHERE c.workspace_id = %s AND c.id = %s AND c.deleted_at IS NULL
        """,
        (ctx.workspace_id, contact_id),
    )
    if not row:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Contact not found"})
    return _row_to_contact(conn, row, ctx)


def update_contact(conn, ctx: WorkspaceContext, user: UserPrincipal, contact_id: str, payload: ContactUpdate) -> Dict[str, Any]:
    # Ensure exists and check visibility constraints
    _ = get_contact(conn, ctx, contact_id)

    sets = []
    params: List[Any] = []

    def set_if(name: str, value: Any, column: str):
        if value is not None:
            sets.append(f"{column} = %s")
            params.append(value)

    set_if("visibility", payload.visibility.value if payload.visibility else None, "visibility")
    set_if("first_name", payload.first_name, "first_name")
    set_if("last_name", payload.last_name, "last_name")
    set_if("middle_name", payload.middle_name, "middle_name")
    set_if("display_name", payload.display_name, "display_name")
    set_if("photo_url", payload.photo_url, "photo_url")

    set_if("emails", payload.emails, "emails")
    set_if("phones", payload.phones, "phones")
    set_if("messengers", payload.messengers, "messengers")

    set_if("city", payload.city, "city")
    set_if("timezone", payload.timezone, "timezone")
    set_if("birthday", payload.birthday, "birthday")

    set_if("organization_id", payload.organization_id, "organization_id")
    set_if("job_title", payload.job_title, "job_title")
    set_if("industries", payload.industries, "industries")
    set_if("competencies", payload.competencies, "competencies")

    set_if("tie_strength", payload.tie_strength.value if payload.tie_strength else None, "tie_strength")
    set_if("trust_score", payload.trust_score, "trust_score")
    set_if("emotional_balance", payload.emotional_balance, "emotional_balance")

    set_if("met_context", payload.met_context, "met_where")
    set_if("shared_notes", payload.shared_notes, "notes_shared")
    set_if("private_notes", payload.private_notes, "notes_private")
    set_if("next_touch_at", payload.next_touch_at, "next_touch_at")

    # context merge (how_can_help/how_i_can_help)
    if payload.how_can_help is not None or payload.how_i_can_help is not None:
        current = fetchone(conn, "SELECT context FROM contacts WHERE id = %s", (contact_id,)) or {}
        ctx_json = current.get("context") or {}
        if payload.how_can_help is not None:
            ctx_json["how_can_help"] = payload.how_can_help
        if payload.how_i_can_help is not None:
            ctx_json["how_i_can_help"] = payload.how_i_can_help
        sets.append("context = %s")
        params.append(ctx_json)

    sets.append("updated_by = %s")
    params.append(user.user_id)
    sets.append("updated_at = now()")

    if sets:
        sql = "UPDATE contacts SET " + ", ".join(sets) + " WHERE workspace_id = %s AND id = %s AND deleted_at IS NULL"
        params.extend([ctx.workspace_id, contact_id])
        execute(conn, sql, tuple(params))

    if payload.tags is not None:
        _set_contact_tags(conn, ctx.workspace_id, contact_id, payload.tags)

    conn.commit()
    return get_contact(conn, ctx, contact_id)


def delete_contact(conn, ctx: WorkspaceContext, user: UserPrincipal, contact_id: str) -> None:
    # Ensure exists
    _ = get_contact(conn, ctx, contact_id)
    execute(
        conn,
        "UPDATE contacts SET deleted_at = now(), updated_at = now(), updated_by = %s WHERE workspace_id = %s AND id = %s AND deleted_at IS NULL",
        (user.user_id, ctx.workspace_id, contact_id),
    )
    conn.commit()
