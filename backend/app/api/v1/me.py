from fastapi import APIRouter, Depends

from app.core.deps import get_current_user, get_db
from app.schemas.me import MeResponse

router = APIRouter()


@router.get("/me", response_model=MeResponse)
def get_me(user=Depends(get_current_user), conn=Depends(get_db)):
    rows = conn.execute(
        """
        SELECT w.id, w.name, w.created_at, m.role, m.is_active, m.created_at
        FROM workspaces w
        JOIN workspace_memberships m ON m.workspace_id = w.id AND m.user_id = %s
        WHERE w.deleted_at IS NULL AND m.deleted_at IS NULL AND m.is_active = true
        ORDER BY w.created_at DESC
        """,
        (user.user_id,),
    ).fetchall()

    return {
        "user": {"id": user.user_id, "email": user.email, "display_name": user.display_name},
        "workspaces": [
            {
                "workspace": {"id": str(r[0]), "name": r[1], "created_at": r[2].isoformat()},
                "membership": {
                    "workspace_id": str(r[0]),
                    "user_id": user.user_id,
                    "email": user.email,
                    "display_name": user.display_name,
                    "membership_role": str(r[3]),
                    "is_active": bool(r[4]),
                    "created_at": r[5].isoformat(),
                },
            }
            for r in rows
        ],
    }
