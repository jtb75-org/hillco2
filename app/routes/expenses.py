from datetime import date
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..auth import require_user
from ..db import get_conn

router = APIRouter(prefix="/api", tags=["expenses"])

# Suggested categories — used as datalist hints in the SPA, not enforced.
COMMON_CATEGORIES = [
    "Mileage",
    "Application fee",
    "Evaluation fee",
    "Travel",
    "Meals",
    "Books / materials",
    "Other",
]


# ---- I/O models ------------------------------------------------------------

class ExpenseCreate(BaseModel):
    expense_date: date | None = None  # defaults to today
    amount: Decimal = Field(..., gt=0)
    category: str | None = None
    description: str | None = None
    billable: bool = True
    user_id: UUID | None = None  # who paid; defaults to the requester


class ExpenseUpdate(BaseModel):
    expense_date: date | None = None
    amount: Decimal | None = Field(default=None, gt=0)
    category: str | None = None
    description: str | None = None
    billable: bool | None = None
    user_id: UUID | None = None


# ---- Helpers ---------------------------------------------------------------

async def _engagement_or_404(conn, engagement_id: UUID):
    if not await conn.fetchval(
        "SELECT 1 FROM engagements WHERE id = $1 AND deleted_at IS NULL",
        engagement_id,
    ):
        raise HTTPException(status_code=404, detail="Engagement not found")


async def _expense_or_404(conn, expense_id: UUID):
    row = await conn.fetchrow("SELECT * FROM expenses WHERE id = $1", expense_id)
    if not row:
        raise HTTPException(status_code=404, detail="Expense not found")
    return row


async def _resolve_active_user(conn, supplied: UUID | None, fallback: UUID) -> UUID:
    if supplied is None or supplied == fallback:
        return fallback
    if await conn.fetchval(
        "SELECT 1 FROM auth WHERE person_id = $1 AND status = 'active'",
        supplied,
    ):
        return supplied
    return fallback


# ---- Routes ----------------------------------------------------------------

@router.get("/expenses/categories")
async def list_categories(_user=Depends(require_user)):
    """Datalist hints; the schema doesn't enforce these so they're just a
    convenience for the SPA's autocomplete."""
    return COMMON_CATEGORIES


@router.get("/engagements/{engagement_id}/expenses")
async def list_expenses(
    engagement_id: UUID,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    await _engagement_or_404(conn, engagement_id)
    rows = await conn.fetch(
        """
        SELECT x.id, x.engagement_id, x.user_id, x.expense_date, x.amount,
               x.category, x.description, x.billable, x.receipt_doc_id,
               x.invoice_id, x.created_at, x.updated_at,
               u.name AS user_name,
               i.invoice_number AS invoice_number
        FROM expenses x
        LEFT JOIN users u    ON u.id = x.user_id
        LEFT JOIN invoices i ON i.id = x.invoice_id
        WHERE x.engagement_id = $1
        ORDER BY x.expense_date DESC, x.id DESC
        """,
        engagement_id,
    )
    return [dict(r) for r in rows]


@router.post("/engagements/{engagement_id}/expenses", status_code=201)
async def add_expense(
    engagement_id: UUID,
    body: ExpenseCreate,
    user=Depends(require_user),
    conn=Depends(get_conn),
):
    await _engagement_or_404(conn, engagement_id)
    expense_date = body.expense_date or date.today()
    category = (body.category or "").strip() or None
    description = (body.description or "").strip() or None
    paid_user_id = await _resolve_active_user(conn, body.user_id, user["id"])

    row = await conn.fetchrow(
        """
        INSERT INTO expenses
          (engagement_id, user_id, expense_date, amount, category, description, billable)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, engagement_id, user_id, expense_date, amount,
                  category, description, billable, receipt_doc_id,
                  invoice_id, created_at, updated_at
        """,
        engagement_id, paid_user_id, expense_date, body.amount,
        category, description, body.billable,
    )
    return dict(row)


@router.patch("/expenses/{expense_id}")
async def update_expense(
    expense_id: UUID,
    body: ExpenseUpdate,
    user=Depends(require_user),
    conn=Depends(get_conn),
):
    expense = await _expense_or_404(conn, expense_id)
    if expense["invoice_id"] is not None:
        raise HTTPException(
            status_code=400,
            detail="Expense is on an invoice. Void or edit the invoice first.",
        )
    fields = body.model_dump(exclude_unset=True)
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")
    if "category" in fields:
        fields["category"] = (fields["category"] or "").strip() or None
    if "description" in fields:
        fields["description"] = (fields["description"] or "").strip() or None
    if "user_id" in fields and fields["user_id"] is not None:
        fields["user_id"] = await _resolve_active_user(
            conn, fields["user_id"], user["id"]
        )

    set_sql = ", ".join(f"{col} = ${i+2}" for i, col in enumerate(fields))
    row = await conn.fetchrow(
        f"""
        UPDATE expenses SET {set_sql} WHERE id = $1
        RETURNING id, engagement_id, user_id, expense_date, amount,
                  category, description, billable, receipt_doc_id,
                  invoice_id, created_at, updated_at
        """,
        expense_id,
        *fields.values(),
    )
    return dict(row)


@router.delete("/expenses/{expense_id}", status_code=204)
async def delete_expense(
    expense_id: UUID,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    expense = await _expense_or_404(conn, expense_id)
    if expense["invoice_id"] is not None:
        raise HTTPException(
            status_code=400,
            detail="Expense is on an invoice. Void or edit the invoice first.",
        )
    await conn.execute("DELETE FROM expenses WHERE id = $1", expense_id)
    return None
