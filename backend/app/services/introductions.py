from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException

from app.core.deps import WorkspaceContext
from app.core.security import UserPrincipal
from app.schemas.introductions import IntroductionCreate, IntroductionUpdate
from app.services.db import execute, execute_returning_one, fetchall, fetchone
from app.services.mapping import INTRO_FROM_DB, INTRO_TO_DB
from app.utils.pagination import decode_cursor, encode_cursor


def _row_to_intro(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": str(row["id"]),
        "workspace_id": str(row["workspace_id"]),
        "status": INTRO_FROM_DB.get(row.get("status"), "requested"),
        "requester_contact_id": str(row["requester_contact_id"]),
        "introducer_contact_id": str(row["introducer_contact_id"]),
        "target_contact_id": str(row["target_contact_id"]),
        "ask": row.get("request_text"),
        "benefit_for_requester": row.get("benefit_a"),
        "benefit_for_target": row.get("benefit_b"),
        "consent_requester": bool(row.get("consent_a")),
        "consent_target": bool(row.get("consent_b")),
        "sent_at": row.get("sent_at").isoformat() if row.get("sent_at") else None,
        "met_at": row.get("met_at").isoformat() if row.get("met_at") else None,
        "outcome": row.get("outcome"),
        "created_by_user_id": str(row.get("created_by")) if row.get("created_by") else None,
        "created_at": row.get("created_at").isoformat(),
        "updated_at": row.get("updated_at").isoformat(),
    }


def list_introductions(conn, ctx: WorkspaceContext, limit: int = 50, cursor: Optional[str] = None, status: Optional[str] = None):
    params: List[Any] = [ctx.workspace_id]
    where = ["workspace_id = %s", "deleted_at IS NULL"]

    if ctx.membership_role != "owner":
        where.append("visibility <> 'private'")

    if status:
        where.append("status = %s")
        params.append(INTRO_TO_DB.get(status, status))

    if cursor:
        c = decode_cursor(cursor)
        where.append("(created_at, id) < (%s, %s)")
        params.extend([c["created_at"], c["id"]])

    sql = "SELECT * FROM introductions WHERE " + " AND ".join(where) + " ORDER BY created_at DESC, id DESC LIMIT %s"
    params.append(limit)

    rows = fetchall(conn, sql, tuple(params))
    data = [_row_to_intro(r) for r in rows]

    next_cur = None
    if len(rows) == limit:
        last = rows[-1]
        next_cur = encode_cursor({"created_at": last["created_at"].isoformat(), "id": str(last["id"])})

    return data, next_cur


def create_introduction(conn, ctx: WorkspaceContext, user: UserPrincipal, payload: IntroductionCreate) -> Dict[str, Any]:
    status_db = INTRO_TO_DB.get(payload.status.value if payload.status else "requested", "requested")
    row = execute_returning_one(
        conn,
        """
        INSERT INTO introductions(
          workspace_id, status,
          requester_contact_id, introducer_contact_id, target_contact_id,
          request_text, benefit_a, benefit_b,
          consent_a, consent_b,
          created_by, updated_by
        ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        RETURNING id
        """,
        (
            ctx.workspace_id,
            status_db,
            payload.requester_contact_id,
            payload.introducer_contact_id,
            payload.target_contact_id,
            payload.ask,
            payload.benefit_for_requester,
            payload.benefit_for_target,
            payload.consent_requester,
            payload.consent_target,
            user.user_id,
            user.user_id,
        ),
    )
    conn.commit()
    return get_introduction(conn, ctx, str(row["id"]))


def get_introduction(conn, ctx: WorkspaceContext, introduction_id: str) -> Dict[str, Any]:
    row = fetchone(conn, "SELECT * FROM introductions WHERE workspace_id = %s AND id = %s AND deleted_at IS NULL", (ctx.workspace_id, introduction_id))
    if not row:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Introduction not found"})
    if ctx.membership_role != "owner" and row.get("visibility") == "private":
        raise HTTPException(status_code=403, detail={"code": "FORBIDDEN", "message": "Private record"})
    return _row_to_intro(row)


def update_introduction(conn, ctx: WorkspaceContext, user: UserPrincipal, introduction_id: str, payload: IntroductionUpdate) -> Dict[str, Any]:
    _ = get_introduction(conn, ctx, introduction_id)

    sets = []
    params: List[Any] = []

    if payload.status is not None:
        sets.append("status = %s")
        params.append(INTRO_TO_DB.get(payload.status.value, payload.status.value))

    def set_if(value: Any, column: str):
        if value is not None:
            sets.append(f"{column} = %s")
            params.append(value)

    set_if(payload.ask, "request_text")
    set_if(payload.benefit_for_requester, "benefit_a")
    set_if(payload.benefit_for_target, "benefit_b")
    set_if(payload.consent_requester, "consent_a")
    set_if(payload.consent_target, "consent_b")
    set_if(payload.sent_at, "sent_at")
    set_if(payload.met_at, "met_at")
    set_if(payload.outcome, "outcome")

    if not sets:
        return get_introduction(conn, ctx, introduction_id)

    sets.append("updated_by = %s")
    params.append(user.user_id)
    sets.append("updated_at = now()")

    sql = "UPDATE introductions SET " + ", ".join(sets) + " WHERE workspace_id = %s AND id = %s AND deleted_at IS NULL"
    params.extend([ctx.workspace_id, introduction_id])
    execute(conn, sql, tuple(params))
    conn.commit()
    return get_introduction(conn, ctx, introduction_id)


def delete_introduction(conn, ctx: WorkspaceContext, user: UserPrincipal, introduction_id: str) -> None:
    _ = get_introduction(conn, ctx, introduction_id)
    execute(conn, "UPDATE introductions SET deleted_at = now(), updated_at = now(), updated_by = %s WHERE workspace_id = %s AND id = %s AND deleted_at IS NULL", (user.user_id, ctx.workspace_id, introduction_id))
    conn.commit()
