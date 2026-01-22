from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException

from app.core.deps import WorkspaceContext
from app.core.security import UserPrincipal
from app.schemas.interactions import InteractionCreate, InteractionUpdate
from app.services.audit import log_audit
from app.services.db import execute, execute_returning_one, fetchall, fetchone
from app.utils.pagination import decode_cursor, encode_cursor


OWNER_ONLY_FIELDS = {"next_action"}
LIMITED_FIELDS = {"outcome", "next_action"}
REDACTION_DEFAULTS = {
    "outcome": None,
    "next_action": None,
    "next_action_at": None,
}


def _redact_fields(data: Dict[str, Any], fields: set[str]) -> Dict[str, Any]:
    for field in fields:
        data[field] = REDACTION_DEFAULTS.get(field)
    return data


def _redact_interaction_dict(
    data: Dict[str, Any],
    ctx: WorkspaceContext,
    interaction_visibility: str,
    contact_visibility: Optional[str],
) -> Dict[str, Any]:
    if ctx.membership_role != "owner":
        _redact_fields(data, OWNER_ONLY_FIELDS)
        if interaction_visibility == "limited" or contact_visibility == "limited":
            _redact_fields(data, LIMITED_FIELDS)
    return data


def _row_to_interaction(row: Dict[str, Any], ctx: WorkspaceContext) -> Dict[str, Any]:
    interaction_visibility = row.get("visibility") or "shared"
    contact_visibility = row.get("contact_visibility")
    data = {
        "id": str(row["id"]),
        "workspace_id": str(row["workspace_id"]),
        "contact_id": str(row["contact_id"]),
        "visibility": interaction_visibility,
        "type": row.get("type"),
        "channel": row.get("channel"),
        "occurred_at": row.get("occurred_at").isoformat(),
        "summary": row.get("summary"),
        "outcome": row.get("outcome"),
        "next_action": row.get("next_action"),
        "next_action_at": row.get("next_action_at").isoformat() if row.get("next_action_at") else None,
        "created_by_user_id": str(row.get("created_by")) if row.get("created_by") else None,
        "created_at": row.get("created_at").isoformat(),
        "updated_at": row.get("updated_at").isoformat(),
    }
    return _redact_interaction_dict(data, ctx, interaction_visibility, contact_visibility)


def list_interactions(
    conn,
    ctx: WorkspaceContext,
    contact_id: Optional[str] = None,
    limit: int = 50,
    cursor: Optional[str] = None,
    from_ts: Optional[str] = None,
    to_ts: Optional[str] = None,
    types: Optional[List[str]] = None,
) -> Tuple[List[Dict[str, Any]], Optional[str]]:
    params: List[Any] = [ctx.workspace_id]
    where = ["i.workspace_id = %s", "i.deleted_at IS NULL"]

    if ctx.membership_role != "owner":
        where.append("i.visibility <> 'private'")
        where.append("(c.visibility IS NULL OR c.visibility <> 'private')")

    if contact_id:
        where.append("i.contact_id = %s")
        params.append(contact_id)

    if from_ts:
        where.append("occurred_at >= %s")
        params.append(from_ts)
    if to_ts:
        where.append("occurred_at <= %s")
        params.append(to_ts)
    if types:
        where.append("type = ANY(%s)")
        params.append(types)

    if cursor:
        c = decode_cursor(cursor)
        where.append("(i.occurred_at, i.created_at, i.id) < (%s, %s, %s)")
        params.extend([c["occurred_at"], c["created_at"], c["id"]])

    sql = """
        SELECT i.*, c.visibility AS contact_visibility
        FROM interactions i
        LEFT JOIN contacts c ON c.id = i.contact_id AND c.deleted_at IS NULL
        WHERE
    """ + " AND ".join(where) + " ORDER BY i.occurred_at DESC, i.created_at DESC, i.id DESC LIMIT %s"
    params.append(limit)

    rows = fetchall(conn, sql, tuple(params))
    data = [_row_to_interaction(r, ctx) for r in rows]

    next_cur = None
    if len(rows) == limit:
        last = rows[-1]
        next_cur = encode_cursor(
            {
                "occurred_at": last["occurred_at"].isoformat(),
                "created_at": last["created_at"].isoformat(),
                "id": str(last["id"]),
            }
        )

    return data, next_cur


def create_interaction(conn, ctx: WorkspaceContext, user: UserPrincipal, contact_id: str, payload: InteractionCreate) -> Dict[str, Any]:
    row = execute_returning_one(
        conn,
        """
        INSERT INTO interactions(
          workspace_id, contact_id, visibility, type, channel,
          occurred_at, summary, outcome, next_action, next_action_at,
          created_by, updated_by
        ) VALUES (
          %s,%s,%s,%s,%s,
          %s,%s,%s,%s,%s,
          %s,%s
        ) RETURNING id
        """,
        (
            ctx.workspace_id,
            contact_id,
            payload.visibility.value,
            payload.type.value,
            payload.channel.value if payload.channel else None,
            payload.occurred_at,
            payload.summary,
            payload.outcome,
            payload.next_action,
            payload.next_action_at,
            user.user_id,
            user.user_id,
        ),
    )
    interaction = get_interaction(conn, ctx, str(row["id"]))
    log_audit(conn, ctx, user, "interaction.create", "interaction", interaction["id"], before=None, after=interaction)
    conn.commit()
    return interaction


def get_interaction(conn, ctx: WorkspaceContext, interaction_id: str) -> Dict[str, Any]:
    row = fetchone(
        conn,
        """
        SELECT i.*, c.visibility AS contact_visibility
        FROM interactions i
        LEFT JOIN contacts c ON c.id = i.contact_id AND c.deleted_at IS NULL
        WHERE i.workspace_id = %s AND i.id = %s AND i.deleted_at IS NULL
        """,
        (ctx.workspace_id, interaction_id),
    )
    if not row:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Взаимодействие не найдено"})
    if ctx.membership_role != "owner":
        if row.get("visibility") == "private" or row.get("contact_visibility") == "private":
            raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Взаимодействие не найдено"})
    return _row_to_interaction(row, ctx)


def update_interaction(conn, ctx: WorkspaceContext, user: UserPrincipal, interaction_id: str, payload: InteractionUpdate) -> Dict[str, Any]:
    before = get_interaction(conn, ctx, interaction_id)

    sets = []
    params: List[Any] = []

    def set_if(value: Any, column: str):
        if value is not None:
            sets.append(f"{column} = %s")
            params.append(value)

    set_if(payload.visibility.value if payload.visibility else None, "visibility")
    set_if(payload.type.value if payload.type else None, "type")
    set_if(payload.channel.value if payload.channel else None, "channel")
    set_if(payload.occurred_at, "occurred_at")
    set_if(payload.summary, "summary")
    set_if(payload.outcome, "outcome")
    set_if(payload.next_action, "next_action")
    set_if(payload.next_action_at, "next_action_at")

    sets.append("updated_by = %s")
    params.append(user.user_id)
    sets.append("updated_at = now()")

    sql = "UPDATE interactions SET " + ", ".join(sets) + " WHERE workspace_id = %s AND id = %s AND deleted_at IS NULL"
    params.extend([ctx.workspace_id, interaction_id])
    execute(conn, sql, tuple(params))
    after = get_interaction(conn, ctx, interaction_id)
    log_audit(conn, ctx, user, "interaction.update", "interaction", interaction_id, before=before, after=after)
    conn.commit()
    return after


def delete_interaction(conn, ctx: WorkspaceContext, user: UserPrincipal, interaction_id: str) -> None:
    before = get_interaction(conn, ctx, interaction_id)
    execute(
        conn,
        "UPDATE interactions SET deleted_at = now(), updated_at = now(), updated_by = %s WHERE workspace_id = %s AND id = %s AND deleted_at IS NULL",
        (user.user_id, ctx.workspace_id, interaction_id),
    )
    log_audit(conn, ctx, user, "interaction.delete", "interaction", interaction_id, before=before, after={"deleted": True})
    conn.commit()
