from __future__ import annotations

from typing import Any, Dict, List

from app.core.deps import WorkspaceContext
from app.core.security import UserPrincipal
from app.schemas.strategy import StrategyUpsert, WheelSegmentUpsert
from app.services.db import execute, fetchall, fetchone


def get_strategy(conn, ctx: WorkspaceContext) -> Dict[str, Any]:
    row = fetchone(conn, "SELECT * FROM strategy WHERE workspace_id = %s", (ctx.workspace_id,))
    if not row:
        return {
            "workspace_id": ctx.workspace_id,
            "vision": None,
            "goals": [],
            "swot": {},
            "roadmap": {},
            "updated_at": "1970-01-01T00:00:00+00:00",
        }
    return {
        "workspace_id": str(row["workspace_id"]),
        "vision": row.get("vision"),
        "goals": row.get("goals") or [],
        "swot": row.get("swot") or {},
        "roadmap": row.get("roadmap") or {},
        "updated_at": row.get("updated_at").isoformat() if row.get("updated_at") else None,
    }


def upsert_strategy(conn, ctx: WorkspaceContext, user: UserPrincipal, payload: StrategyUpsert) -> Dict[str, Any]:
    current = fetchone(conn, "SELECT * FROM strategy WHERE workspace_id = %s", (ctx.workspace_id,))
    if not current:
        execute(
            conn,
            """
            INSERT INTO strategy(workspace_id, vision, goals, swot, roadmap, updated_by)
            VALUES (%s,%s,%s,%s,%s,%s)
            """,
            (
                ctx.workspace_id,
                payload.vision,
                payload.goals or [],
                payload.swot or {},
                payload.roadmap or {},
                user.user_id,
            ),
        )
    else:
        vision = payload.vision if payload.vision is not None else current.get("vision")
        goals = payload.goals if payload.goals is not None else (current.get("goals") or [])
        swot = payload.swot if payload.swot is not None else (current.get("swot") or {})
        roadmap = payload.roadmap if payload.roadmap is not None else (current.get("roadmap") or {})

        execute(
            conn,
            """
            UPDATE strategy SET vision=%s, goals=%s, swot=%s, roadmap=%s, updated_by=%s, updated_at=now()
            WHERE workspace_id=%s
            """,
            (vision, goals, swot, roadmap, user.user_id, ctx.workspace_id),
        )

    conn.commit()
    return get_strategy(conn, ctx)


def get_wheel(conn, ctx: WorkspaceContext) -> List[Dict[str, Any]]:
    rows = fetchall(conn, "SELECT * FROM wheel_segments WHERE workspace_id = %s ORDER BY segment_key", (ctx.workspace_id,))
    return [
        {
            "workspace_id": str(r["workspace_id"]),
            "key": r["segment_key"],
            "current": int(r.get("current_score") or 0),
            "target": int(r.get("target_score") or 0),
            "notes": r.get("notes"),
            "updated_at": r.get("updated_at").isoformat() if r.get("updated_at") else None,
        }
        for r in rows
    ]


def replace_wheel(conn, ctx: WorkspaceContext, user: UserPrincipal, segments: List[WheelSegmentUpsert]) -> List[Dict[str, Any]]:
    execute(conn, "DELETE FROM wheel_segments WHERE workspace_id = %s", (ctx.workspace_id,))
    for s in segments:
        execute(
            conn,
            """
            INSERT INTO wheel_segments(workspace_id, segment_key, current_score, target_score, notes, updated_by)
            VALUES (%s,%s,%s,%s,%s,%s)
            """,
            (ctx.workspace_id, s.key, s.current, s.target, s.notes, user.user_id),
        )
    conn.commit()
    return get_wheel(conn, ctx)
