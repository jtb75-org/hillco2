import os

from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
async def health():
    return {"status": "ok", "build": os.environ.get("BUILD_COMMIT", "dev")}
