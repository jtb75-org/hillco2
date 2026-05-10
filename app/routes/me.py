from fastapi import APIRouter, Depends

from ..auth import require_user

router = APIRouter()


@router.get("/api/me")
async def me(user=Depends(require_user)):
    return {
        "id": str(user["id"]),
        "email": user["email"],
        "name": user["name"],
        "role": user["role"],
    }
