from fastapi import APIRouter, Depends

from app.core.deps import get_current_user
from app.schemas.me import Me

router = APIRouter()


@router.get("/me", response_model=Me)
def get_me(user=Depends(get_current_user)):
    return {"id": user.user_id, "email": user.email, "display_name": user.display_name}
