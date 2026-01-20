from fastapi import APIRouter, Depends

from app.core.deps import get_current_user
from app.core.security import UserPrincipal

router = APIRouter()


@router.get("/me")
def get_me(user: UserPrincipal = Depends(get_current_user)):
    return {"user_id": user.user_id, "email": user.email, "display_name": user.display_name}
