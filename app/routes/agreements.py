"""Agreements: services contracts and medical releases.

Engagement-scoped legal artifacts with a shared lifecycle (draft →
active → superseded/expired/terminated). Services contracts carry an
amount and an auto-generated contract_number; medical releases don't.

Document attachment uses the existing polymorphic documents table:
documents.owner_type='agreement', owner_id=this row's id. The route
layer validates that an attached document_id actually owns this
agreement; the DB FK on agreements.document_id only enforces basic
referential integrity.
"""
from datetime import date, datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel

from ..auth import require_user
from ..db import get_conn
from .documents import store_uploaded_document

router = APIRouter(prefix="/api", tags=["agreements"])


AgreementType = Literal["services_contract", "medical_release"]
AgreementStatus = Literal["draft", "active", "superseded", "expired", "terminated"]


# ---- I/O models -----------------------------------------------------------

class AgreementCreate(BaseModel):
    type: AgreementType
    amount: Decimal | None = None
    signed_at: date | None = None
    effective_date: date | None = None
    expires_at: date | None = None
    document_id: UUID | None = None
    notes: str | None = None


class AgreementUpdate(BaseModel):
    status: AgreementStatus | None = None
    amount: Decimal | None = None
    sent_at: datetime | None = None
    signed_at: date | None = None
    effective_date: date | None = None
    expires_at: date | None = None
    document_id: UUID | None = None
    notes: str | None = None


class AgreementSupersede(BaseModel):
    """Body for the supersede action — same shape as Create minus type
    (the new agreement inherits the predecessor's type)."""
    amount: Decimal | None = None
    signed_at: date | None = None
    effective_date: date | None = None
    expires_at: date | None = None
    document_id: UUID | None = None
    notes: str | None = None


# ---- Helpers --------------------------------------------------------------

async def _engagement_or_404(conn, engagement_id: UUID) -> None:
    if not await conn.fetchval(
        "SELECT 1 FROM engagements WHERE id = $1 AND deleted_at IS NULL",
        engagement_id,
    ):
        raise HTTPException(status_code=404, detail="Engagement not found")


async def _agreement_or_404(conn, agreement_id: UUID):
    row = await conn.fetchrow("SELECT * FROM agreements WHERE id = $1", agreement_id)
    if not row:
        raise HTTPException(status_code=404, detail="Agreement not found")
    return row


async def _validate_document_for_agreement(
    conn, document_id: UUID | None, *, agreement_id: UUID | None = None,
) -> None:
    """If a document is attached, its owner_type/owner_id must point at
    THIS agreement (or be unowned/family-level — both are reasonable for
    agreements that haven't been "claimed" yet). Anything pointing at a
    different agreement, a student, or a note is a misattachment."""
    if document_id is None:
        return
    row = await conn.fetchrow(
        "SELECT owner_type, owner_id FROM documents WHERE id = $1 AND deleted_at IS NULL",
        document_id,
    )
    if row is None:
        raise HTTPException(status_code=400, detail="document_id not found.")
    if row["owner_type"] == "agreement" and (agreement_id is None or row["owner_id"] == agreement_id):
        return
    raise HTTPException(
        status_code=400,
        detail=f"document_id is owned by {row['owner_type']}; cannot attach to an agreement.",
    )


# ---- Routes ---------------------------------------------------------------

@router.get("/engagements/{engagement_id}/agreements")
async def list_for_engagement(
    engagement_id: UUID,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    """All agreements for an engagement, newest first. The history
    chain (supersedes_id) is reachable via repeated detail fetches;
    this list view just orders by created_at."""
    await _engagement_or_404(conn, engagement_id)
    rows = await conn.fetch(
        """
        SELECT a.id, a.engagement_id, a.type, a.status, a.contract_number,
               a.amount, a.sent_at, a.signed_at, a.effective_date, a.expires_at,
               a.supersedes_id, a.document_id, a.notes,
               a.created_by, a.created_at, a.updated_at,
               TRIM(BOTH ' ' FROM COALESCE(u.first_name,'') || CASE WHEN u.last_name IS NOT NULL AND u.last_name <> '' THEN ' ' || u.last_name ELSE '' END) AS created_by_name
        FROM agreements a
        LEFT JOIN people u ON u.id = a.created_by
        WHERE a.engagement_id = $1
        ORDER BY a.created_at DESC, a.id DESC
        """,
        engagement_id,
    )
    return [dict(r) for r in rows]


@router.post("/engagements/{engagement_id}/agreements", status_code=201)
async def create_agreement(
    engagement_id: UUID,
    body: AgreementCreate,
    user=Depends(require_user),
    conn=Depends(get_conn),
):
    """Creates a draft agreement. Use PATCH to flip status='active' once
    signed. services_contract auto-generates a contract_number (SC-YYYY-NNNN)
    via next_contract_number(); medical_release leaves it NULL."""
    await _engagement_or_404(conn, engagement_id)
    await _validate_document_for_agreement(conn, body.document_id)

    contract_number = None
    if body.type == "services_contract":
        contract_number = await conn.fetchval("SELECT next_contract_number()")

    row = await conn.fetchrow(
        """
        INSERT INTO agreements (
          engagement_id, type, status, contract_number, amount,
          signed_at, effective_date, expires_at,
          document_id, notes, created_by
        ) VALUES ($1, $2::agreement_type, 'draft', $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
        """,
        engagement_id, body.type, contract_number, body.amount,
        body.signed_at, body.effective_date, body.expires_at,
        body.document_id, (body.notes or "").strip() or None, user["id"],
    )
    return dict(row)


@router.get("/agreements/{agreement_id}")
async def agreement_detail(
    agreement_id: UUID,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    row = await conn.fetchrow(
        """
        SELECT a.*, TRIM(BOTH ' ' FROM COALESCE(u.first_name,'') || CASE WHEN u.last_name IS NOT NULL AND u.last_name <> '' THEN ' ' || u.last_name ELSE '' END) AS created_by_name
        FROM agreements a
        LEFT JOIN people u ON u.id = a.created_by
        WHERE a.id = $1
        """,
        agreement_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Agreement not found")
    return dict(row)


@router.patch("/agreements/{agreement_id}")
async def update_agreement(
    agreement_id: UUID,
    body: AgreementUpdate,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    """Updates an existing agreement. Status transitions are validated
    only loosely here — the partial UNIQUE on active-per-type catches
    the dangerous case (two active agreements of the same type for one
    engagement). Use POST /agreements/{id}/supersede for the
    supersession-with-new-row flow."""
    await _agreement_or_404(conn, agreement_id)
    fields = body.model_dump(exclude_unset=True)
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")
    if "document_id" in fields:
        await _validate_document_for_agreement(
            conn, fields["document_id"], agreement_id=agreement_id,
        )
    if "notes" in fields:
        fields["notes"] = (fields["notes"] or "").strip() or None

    sets = []
    values = []
    for col, val in fields.items():
        if col == "status":
            sets.append(f"status = ${len(values)+2}::agreement_status")
        else:
            sets.append(f"{col} = ${len(values)+2}")
        values.append(val)
    set_sql = ", ".join(sets)
    row = await conn.fetchrow(
        f"UPDATE agreements SET {set_sql} WHERE id = $1 RETURNING *",
        agreement_id,
        *values,
    )
    return dict(row)


@router.post("/agreements/{agreement_id}/supersede", status_code=201)
async def supersede_agreement(
    agreement_id: UUID,
    body: AgreementSupersede,
    user=Depends(require_user),
    conn=Depends(get_conn),
):
    """Two-step move: the predecessor flips to status='superseded' and
    a new draft is created with supersedes_id pointing back. Both steps
    happen in the same transaction (the route's get_conn dependency)
    so a partial failure rolls cleanly."""
    pred = await _agreement_or_404(conn, agreement_id)
    if pred["status"] in ("superseded", "expired", "terminated"):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot supersede an agreement in status '{pred['status']}'.",
        )
    await _validate_document_for_agreement(conn, body.document_id)

    contract_number = None
    if pred["type"] == "services_contract":
        contract_number = await conn.fetchval("SELECT next_contract_number()")

    await conn.execute(
        "UPDATE agreements SET status = 'superseded' WHERE id = $1",
        agreement_id,
    )
    new_row = await conn.fetchrow(
        """
        INSERT INTO agreements (
          engagement_id, type, status, contract_number, amount,
          signed_at, effective_date, expires_at,
          document_id, notes, supersedes_id, created_by
        ) VALUES ($1, $2, 'draft', $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
        """,
        pred["engagement_id"], pred["type"], contract_number, body.amount,
        body.signed_at, body.effective_date, body.expires_at,
        body.document_id, (body.notes or "").strip() or None,
        agreement_id, user["id"],
    )
    return dict(new_row)


@router.post("/agreements/{agreement_id}/mark-sent")
async def mark_agreement_sent(
    agreement_id: UUID,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    """Stamp sent_at = NOW() while keeping status='draft'. The "sent"
    UI state is derived as (status='draft' AND sent_at IS NOT NULL).
    Idempotent — re-sending preserves the first sent_at via COALESCE;
    the UI can offer an explicit re-send affordance that PATCHes
    sent_at directly if it wants to overwrite."""
    row = await _agreement_or_404(conn, agreement_id)
    if row["status"] != "draft":
        raise HTTPException(
            status_code=400,
            detail=f"Cannot mark-sent an agreement in status '{row['status']}'.",
        )
    updated = await conn.fetchrow(
        """
        UPDATE agreements
        SET sent_at = COALESCE(sent_at, NOW())
        WHERE id = $1
        RETURNING *
        """,
        agreement_id,
    )
    return dict(updated)


@router.post("/agreements/{agreement_id}/upload-signed", status_code=201)
async def upload_signed_agreement(
    agreement_id: UUID,
    file: UploadFile = File(...),
    user=Depends(require_user),
    conn=Depends(get_conn),
):
    """Upload the signed PDF for this agreement. In one transaction:
    create a documents row (owner_type='agreement', owner_id=this
    agreement), link it via agreements.document_id, stamp signed_at,
    and flip status to 'active'. Requires the agreement to be in
    'draft' status (cannot re-sign a superseded/expired/terminated
    row; supersede first instead)."""
    row = await _agreement_or_404(conn, agreement_id)
    if row["status"] != "draft":
        raise HTTPException(
            status_code=400,
            detail=(
                f"Cannot upload signed copy for an agreement in status "
                f"'{row['status']}'; supersede it first."
            ),
        )
    doc = await store_uploaded_document(
        conn,
        owner_type="agreement",
        owner_id=agreement_id,
        kind="other",
        file=file,
        uploaded_by=user["id"],
    )
    updated = await conn.fetchrow(
        """
        UPDATE agreements
        SET document_id = $2,
            signed_at = COALESCE(signed_at, CURRENT_DATE),
            status = 'active'
        WHERE id = $1
        RETURNING *
        """,
        agreement_id, doc["id"],
    )
    return {"agreement": dict(updated), "document": doc}


@router.delete("/agreements/{agreement_id}", status_code=204)
async def delete_agreement(
    agreement_id: UUID,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    """Hard delete is only permitted for draft agreements that aren't
    part of a supersession chain — anything signed has financial /
    legal weight and must use status transitions instead."""
    pred = await _agreement_or_404(conn, agreement_id)
    if pred["status"] != "draft":
        raise HTTPException(
            status_code=400,
            detail="Only draft agreements can be deleted; use status='terminated' otherwise.",
        )
    referenced = await conn.fetchval(
        "SELECT 1 FROM agreements WHERE supersedes_id = $1",
        agreement_id,
    )
    if referenced:
        raise HTTPException(
            status_code=400,
            detail="Another agreement supersedes this one; deletion would orphan the chain.",
        )
    await conn.execute("DELETE FROM agreements WHERE id = $1", agreement_id)
    return None
