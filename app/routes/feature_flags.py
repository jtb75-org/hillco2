"""Feature flags — admin-toggleable UI switches.

The catalog of known flags lives here (``FLAG_DEFS``); the DB only stores
overrides, so reading merges defaults with stored rows and a newly-added
flag works from its default before anyone touches it.

Any authenticated user can *read* the flags (the SPA gates UI on them);
only admins can *change* them.
"""
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..auth import require_admin, require_user
from ..db import get_conn

router = APIRouter(prefix="/api/feature-flags", tags=["feature-flags"])


# key -> {label, description, default}. Add new flags here; the DB stores
# only the on/off override, keyed by this string.
FLAG_DEFS: dict[str, dict] = {
    "intake_referral": {
        "label": "Intake referral source",
        "description": "Show the referral-source field on intakes.",
        "default": True,
    },
}


class FeatureFlag(BaseModel):
    key: str
    label: str
    description: str
    enabled: bool
    default: bool


class FeatureFlagUpdate(BaseModel):
    enabled: bool


def _to_flag(key: str, enabled: bool) -> FeatureFlag:
    d = FLAG_DEFS[key]
    return FeatureFlag(
        key=key,
        label=d["label"],
        description=d["description"],
        enabled=enabled,
        default=d["default"],
    )


@router.get("", response_model=list[FeatureFlag])
async def list_flags(
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    rows = await conn.fetch("SELECT key, enabled FROM feature_flags")
    overrides = {r["key"]: r["enabled"] for r in rows}
    return [
        _to_flag(key, overrides.get(key, d["default"]))
        for key, d in FLAG_DEFS.items()
    ]


@router.patch("/{key}", response_model=FeatureFlag)
async def update_flag(
    key: str,
    body: FeatureFlagUpdate,
    _user=Depends(require_admin),
    conn=Depends(get_conn),
):
    if key not in FLAG_DEFS:
        raise HTTPException(status_code=404, detail=f"unknown feature flag '{key}'")
    await conn.execute(
        """
        INSERT INTO feature_flags (key, enabled, updated_at)
        VALUES ($1, $2, $3)
        ON CONFLICT (key) DO UPDATE
            SET enabled = EXCLUDED.enabled, updated_at = EXCLUDED.updated_at
        """,
        key,
        body.enabled,
        datetime.now(UTC),
    )
    return _to_flag(key, body.enabled)
