from datetime import date, timedelta
from decimal import Decimal
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel, Field

from ..auth import require_user
from ..db import get_conn
from ..email import EmailSendError, send_email

# weasyprint and ..pdf are lazy-imported inside the PDF endpoint so the
# rest of the app (and the test suite on macOS) don't pay the
# cffi/libpango dlopen cost. Importing weasyprint at module load time
# segfaults on macOS hosts that lack libpango/libcairo.

router = APIRouter(prefix="/api", tags=["invoices"])

# A Jinja2 environment scoped to PDF templates only — the rest of the app
# is JSON. Lives here rather than in main.py so the PDF dependency stays
# isolated to this module.
_pdf_templates = Jinja2Templates(directory="app/templates")

InvoiceStatus = Literal["draft", "sent", "paid", "overdue", "void"]
InvoiceListFilter = Literal["open", "paid", "draft", "void", "all"]


# ---- I/O models ------------------------------------------------------------

class InvoiceCreate(BaseModel):
    """Build a draft invoice from selected billable time entries and
    expenses on an engagement. Either list may be empty but not both."""
    issue_date: date | None = None  # defaults to today
    due_date: date | None = None
    tax: Decimal = Field(default=Decimal("0"), ge=0)
    notes: str | None = None
    time_entry_ids: list[UUID] = Field(default_factory=list)
    expense_ids: list[UUID] = Field(default_factory=list)


class InvoiceDraftUpdate(BaseModel):
    issue_date: date | None = None
    due_date: date | None = None
    tax: Decimal | None = Field(default=None, ge=0)
    notes: str | None = None


class CustomLineItem(BaseModel):
    description: str = Field(..., min_length=1)
    quantity: Decimal = Field(default=Decimal("1"), gt=0)
    unit_price: Decimal = Field(default=Decimal("0"), ge=0)


class MarkPaid(BaseModel):
    paid_date: date | None = None  # defaults to today
    paid_amount: Decimal | None = None  # defaults to invoice total


class EmailInvoiceRequest(BaseModel):
    """Send an invoice by email. All fields optional — `to` defaults to the
    family's billing contact email; subject/body fall back to templated
    defaults if omitted. Address format is not enforced here (would
    require pydantic's EmailStr / email-validator); the SMTP relay
    rejects malformed addresses and we surface its error."""
    to: str | None = None
    cc: list[str] = Field(default_factory=list)
    bcc: list[str] = Field(default_factory=list)
    subject: str | None = None
    body: str | None = None


# ---- Helpers ---------------------------------------------------------------

async def _invoice_or_404(conn, invoice_id: UUID):
    row = await conn.fetchrow(
        """
        SELECT i.*,
               e.id AS engagement_id_dup, f.id AS family_id, f.household_name
        FROM invoices i
        JOIN engagements e ON e.id = i.engagement_id
        JOIN families f ON f.id = e.family_id
        WHERE i.id = $1 AND i.deleted_at IS NULL
        """,
        invoice_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return row


async def _engagement_or_404(conn, engagement_id: UUID):
    row = await conn.fetchrow(
        "SELECT id, default_hourly_rate FROM engagements WHERE id = $1 AND deleted_at IS NULL",
        engagement_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Engagement not found")
    return row


async def _recompute_totals(conn, invoice_id: UUID):
    subtotal = await conn.fetchval(
        "SELECT COALESCE(SUM(line_total), 0) FROM invoice_line_items WHERE invoice_id = $1",
        invoice_id,
    )
    tax = await conn.fetchval("SELECT tax FROM invoices WHERE id = $1", invoice_id)
    total = (subtotal or Decimal("0")) + (tax or Decimal("0"))
    await conn.execute(
        "UPDATE invoices SET subtotal = $1, total = $2 WHERE id = $3",
        subtotal or Decimal("0"), total, invoice_id,
    )


def _is_overdue(status: str, due_date: date | None) -> bool:
    return (
        status == "sent"
        and due_date is not None
        and due_date < date.today()
    )


# ---- List + summary --------------------------------------------------------

@router.get("/invoices")
async def list_invoices(
    status: InvoiceListFilter = Query("open"),
    engagement_id: UUID | None = Query(None),
    q: str | None = Query(None, description="case-insensitive substring of invoice_number or household_name"),
    issued_from: date | None = Query(None, description="inclusive lower bound on issue_date"),
    issued_to: date | None = Query(None, description="inclusive upper bound on issue_date"),
    due_from: date | None = Query(None, description="inclusive lower bound on due_date"),
    due_to: date | None = Query(None, description="inclusive upper bound on due_date"),
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    """Lists invoices and a financial summary across all engagements.
    Status filter:
      - open: sent + overdue
      - paid: only paid
      - draft / void: literal status match
      - all: everything (still excludes deleted)

    engagement_id narrows both the invoice list and the summary to a
    single engagement (powers the engagement billing panel).

    q does a case-insensitive substring match against invoice_number
    OR household_name — supports the SPA's combined search box.

    Date ranges are inclusive on both ends. Each pair is independent;
    issued_from without issued_to is an open-ended lower bound. Date
    filters apply only to the invoice list, not the financial summary
    (which is engagement-aggregated and unrelated to per-invoice
    dates)."""
    if status == "open":
        status_filter = ["sent", "overdue"]
    elif status in ("paid", "draft", "void"):
        status_filter = [status]
    else:
        status_filter = None

    # asyncpg ILIKE wants the wildcards baked into the bind param; the
    # `NULL OR …` chain treats an absent param as "no filter".
    q_pattern = f"%{q.strip()}%" if q and q.strip() else None

    rows = await conn.fetch(
        """
        SELECT i.id, i.invoice_number, i.status, i.issue_date, i.due_date,
               i.subtotal, i.tax, i.total, i.paid_amount, i.paid_date,
               i.sent_at, i.engagement_id,
               f.id AS family_id, f.household_name
        FROM invoices i
        JOIN engagements e ON e.id = i.engagement_id
        JOIN families f ON f.id = e.family_id
        WHERE i.deleted_at IS NULL
          AND ($1::text[] IS NULL OR i.status::text = ANY($1::text[]))
          AND ($2::uuid IS NULL OR i.engagement_id = $2)
          AND ($3::text IS NULL OR i.invoice_number ILIKE $3 OR f.household_name ILIKE $3)
          AND ($4::date IS NULL OR i.issue_date >= $4)
          AND ($5::date IS NULL OR i.issue_date <= $5)
          AND ($6::date IS NULL OR i.due_date   >= $6)
          AND ($7::date IS NULL OR i.due_date   <= $7)
        ORDER BY
          CASE i.status
            WHEN 'overdue' THEN 0 WHEN 'sent' THEN 1 WHEN 'draft' THEN 2
            WHEN 'paid' THEN 3 WHEN 'void' THEN 4
          END,
          i.due_date ASC NULLS LAST, i.id DESC
        """,
        status_filter, engagement_id, q_pattern,
        issued_from, issued_to, due_from, due_to,
    )

    summary_rows = await conn.fetch(
        """
        SELECT fs.engagement_id,
               fs.uninvoiced_total, fs.billed_total, fs.paid_total,
               fs.outstanding_balance,
               f.id AS family_id, f.household_name
        FROM engagement_financial_summary fs
        JOIN engagements e ON e.id = fs.engagement_id
        JOIN families f ON f.id = e.family_id AND f.deleted_at IS NULL
        WHERE ($1::uuid IS NULL OR fs.engagement_id = $1)
          AND (fs.uninvoiced_total > 0
            OR fs.billed_total > 0
            OR fs.outstanding_balance > 0)
        ORDER BY fs.outstanding_balance DESC, fs.uninvoiced_total DESC,
                 f.household_name
        """,
        engagement_id,
    )

    totals = {
        "uninvoiced": sum(s["uninvoiced_total"] for s in summary_rows),
        "invoiced":   sum(s["billed_total"]      for s in summary_rows),
        "paid":       sum(s["paid_total"]        for s in summary_rows),
        "outstanding":sum(s["outstanding_balance"] for s in summary_rows),
    }

    # Per-status counts for the SPA's tab badges. Respects the non-status
    # filters (q, engagement_id, date ranges) so tab numbers reflect the
    # operator's current narrowing — e.g. "Open (3)" means "3 invoices
    # match Open right now". The status filter itself is deliberately
    # ignored here; that's the column we're grouping by.
    count_rows = await conn.fetch(
        """
        SELECT i.status::text AS status, COUNT(*) AS count
        FROM invoices i
        JOIN engagements e ON e.id = i.engagement_id
        JOIN families f ON f.id = e.family_id
        WHERE i.deleted_at IS NULL
          AND ($1::uuid IS NULL OR i.engagement_id = $1)
          AND ($2::text IS NULL OR i.invoice_number ILIKE $2 OR f.household_name ILIKE $2)
          AND ($3::date IS NULL OR i.issue_date >= $3)
          AND ($4::date IS NULL OR i.issue_date <= $4)
          AND ($5::date IS NULL OR i.due_date   >= $5)
          AND ($6::date IS NULL OR i.due_date   <= $6)
        GROUP BY i.status
        """,
        engagement_id, q_pattern, issued_from, issued_to, due_from, due_to,
    )
    raw_counts = {r["status"]: r["count"] for r in count_rows}
    status_counts = {
        # "open" mirrors the open status_filter: sent + overdue.
        "open":  raw_counts.get("sent", 0) + raw_counts.get("overdue", 0),
        "draft": raw_counts.get("draft", 0),
        "paid":  raw_counts.get("paid", 0),
        "void":  raw_counts.get("void", 0),
        "all":   sum(raw_counts.values()),
    }

    return {
        "invoices":      [dict(r) for r in rows],
        "summary":       [dict(r) for r in summary_rows],
        "totals":        totals,
        "status_counts": status_counts,
    }


# ---- Per-engagement helpers ------------------------------------------------

@router.get("/engagements/{engagement_id}/uninvoiced")
async def uninvoiced_for_engagement(
    engagement_id: UUID,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    """Billable time entries + expenses on this engagement that aren't
    yet attached to an invoice. Powers the SPA's "new invoice" picker."""
    await _engagement_or_404(conn, engagement_id)
    time_entries = await conn.fetch(
        """
        SELECT t.id, t.work_date, t.hours, t.description, t.hourly_rate,
               TRIM(BOTH ' ' FROM COALESCE(u.first_name,'') || CASE WHEN u.last_name IS NOT NULL AND u.last_name <> '' THEN ' ' || u.last_name ELSE '' END) AS user_name
        FROM time_entries t
        LEFT JOIN people u ON u.id = t.user_id
        WHERE t.engagement_id = $1 AND t.invoice_id IS NULL AND t.billable = TRUE
        ORDER BY t.work_date, t.id
        """,
        engagement_id,
    )
    expenses = await conn.fetch(
        """
        SELECT x.id, x.expense_date, x.amount, x.category, x.description,
               TRIM(BOTH ' ' FROM COALESCE(u.first_name,'') || CASE WHEN u.last_name IS NOT NULL AND u.last_name <> '' THEN ' ' || u.last_name ELSE '' END) AS user_name
        FROM expenses x
        LEFT JOIN people u ON u.id = x.user_id
        WHERE x.engagement_id = $1 AND x.invoice_id IS NULL AND x.billable = TRUE
        ORDER BY x.expense_date, x.id
        """,
        engagement_id,
    )
    return {
        "time_entries": [dict(r) for r in time_entries],
        "expenses":     [dict(r) for r in expenses],
    }


# ---- Create (under an engagement) ------------------------------------------

@router.post("/engagements/{engagement_id}/invoices", status_code=201)
async def create_invoice(
    engagement_id: UUID,
    body: InvoiceCreate,
    user=Depends(require_user),
    conn=Depends(get_conn),
):
    engagement = await _engagement_or_404(conn, engagement_id)
    if not body.time_entry_ids and not body.expense_ids:
        raise HTTPException(status_code=400, detail="Select at least one time entry or expense")

    issue_date = body.issue_date or date.today()
    notes = (body.notes or "").strip() or None

    invoice_number = await conn.fetchval("SELECT next_invoice_number()")
    invoice_id = await conn.fetchval(
        """
        INSERT INTO invoices (
          invoice_number, engagement_id, status, issue_date, due_date,
          subtotal, tax, total, notes, created_by
        ) VALUES ($1, $2, 'draft', $3, $4, 0, $5, $5, $6, $7)
        RETURNING id
        """,
        invoice_number, engagement_id, issue_date, body.due_date,
        body.tax, notes, user["id"],
    )

    sort_order = 0
    if body.time_entry_ids:
        time_rows = await conn.fetch(
            """
            SELECT t.id, t.work_date, t.hours, t.description, t.hourly_rate,
                   TRIM(BOTH ' ' FROM COALESCE(u.first_name,'') || CASE WHEN u.last_name IS NOT NULL AND u.last_name <> '' THEN ' ' || u.last_name ELSE '' END) AS user_name
            FROM time_entries t
            LEFT JOIN people u ON u.id = t.user_id
            WHERE t.id = ANY($1::uuid[]) AND t.engagement_id = $2
              AND t.invoice_id IS NULL AND t.billable = TRUE
            ORDER BY t.work_date, t.id
            FOR UPDATE OF t
            """,
            body.time_entry_ids, engagement_id,
        )
        for t in time_rows:
            # Refuse to silently bill a time entry at $0. The prior code
            # fell back to Decimal("0") which produced empty-money lines
            # with no surface signal to the operator.
            rate = t["hourly_rate"] or engagement["default_hourly_rate"]
            if rate is None or rate == 0:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Time entry {t['id']} has no rate. Set the entry's "
                        "hourly_rate or the engagement's default_hourly_rate "
                        "before invoicing."
                    ),
                )
            line_total = t["hours"] * rate
            desc_parts = [f"Time {t['work_date'].strftime('%Y-%m-%d')}"]
            if t["description"]:
                desc_parts.append(t["description"])
            if t["user_name"]:
                desc_parts.append(f"({t['user_name']})")
            await conn.execute(
                """
                INSERT INTO invoice_line_items
                  (invoice_id, sort_order, description, quantity, unit_price, line_total,
                   source_type, source_id)
                VALUES ($1, $2, $3, $4, $5, $6, 'time'::invoice_line_source, $7)
                """,
                invoice_id, sort_order, " — ".join(desc_parts),
                t["hours"], rate, line_total, t["id"],
            )
            sort_order += 1
            await conn.execute(
                "UPDATE time_entries SET invoice_id = $1 WHERE id = $2",
                invoice_id, t["id"],
            )

    if body.expense_ids:
        expense_rows = await conn.fetch(
            """
            SELECT x.id, x.expense_date, x.amount, x.category, x.description
            FROM expenses x
            WHERE x.id = ANY($1::uuid[]) AND x.engagement_id = $2
              AND x.invoice_id IS NULL AND x.billable = TRUE
            ORDER BY x.expense_date, x.id
            FOR UPDATE
            """,
            body.expense_ids, engagement_id,
        )
        for x in expense_rows:
            desc_parts = [f"Expense {x['expense_date'].strftime('%Y-%m-%d')}"]
            if x["category"]:
                desc_parts.append(x["category"])
            if x["description"]:
                desc_parts.append(x["description"])
            await conn.execute(
                """
                INSERT INTO invoice_line_items
                  (invoice_id, sort_order, description, quantity, unit_price, line_total,
                   source_type, source_id)
                VALUES ($1, $2, $3, 1, $4, $4, 'expense'::invoice_line_source, $5)
                """,
                invoice_id, sort_order, " — ".join(desc_parts),
                x["amount"], x["id"],
            )
            sort_order += 1
            await conn.execute(
                "UPDATE expenses SET invoice_id = $1 WHERE id = $2",
                invoice_id, x["id"],
            )

    await _recompute_totals(conn, invoice_id)
    return await invoice_detail(invoice_id, _user=user, conn=conn)


# ---- Detail ----------------------------------------------------------------

@router.get("/invoices/{invoice_id}")
async def invoice_detail(
    invoice_id: UUID,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    invoice = await _invoice_or_404(conn, invoice_id)
    line_items = await conn.fetch(
        """
        SELECT id, sort_order, description, quantity, unit_price, line_total,
               source_type, source_id
        FROM invoice_line_items
        WHERE invoice_id = $1
        ORDER BY sort_order, id
        """,
        invoice_id,
    )
    emails = await conn.fetch(
        """
        SELECT ie.id, ie.to_address, ie.cc_addresses, ie.bcc_addresses,
               ie.subject, ie.sent_at, ie.smtp_message_id,
               TRIM(BOTH ' ' FROM COALESCE(p.first_name, '') ||
                 CASE WHEN p.last_name IS NOT NULL AND p.last_name <> ''
                      THEN ' ' || p.last_name ELSE '' END
               ) AS sent_by_name
        FROM invoice_emails ie
        LEFT JOIN people p ON p.id = ie.sent_by
        WHERE ie.invoice_id = $1
        ORDER BY ie.sent_at DESC
        """,
        invoice_id,
    )

    out = dict(invoice)
    out.pop("engagement_id_dup", None)
    out["family"] = {"id": invoice["family_id"], "household_name": invoice["household_name"]}
    out.pop("family_id", None)
    out.pop("household_name", None)
    out["line_items"] = [dict(li) for li in line_items]
    out["emails"] = [dict(e) for e in emails]
    out["is_overdue"] = _is_overdue(invoice["status"], invoice["due_date"])
    return out


# ---- PDF -------------------------------------------------------------------

async def _render_invoice_pdf(conn, invoice) -> bytes:
    """Build the PDF bytes for an already-loaded invoice row. Shared by
    the /pdf endpoint and the email endpoint so both produce the exact
    same artifact (operator preview === what the family receives)."""
    line_items = await conn.fetch(
        """
        SELECT description, quantity, unit_price, line_total, sort_order
        FROM invoice_line_items
        WHERE invoice_id = $1
        ORDER BY sort_order, id
        """,
        invoice["id"],
    )
    primary_contact = await conn.fetchrow(
        """
        SELECT
          TRIM(BOTH ' ' FROM
            COALESCE(p.first_name, '') ||
            CASE WHEN p.last_name IS NOT NULL AND p.last_name <> ''
                 THEN ' ' || p.last_name ELSE '' END
          )       AS name,
          p.email,
          p.phone
        FROM family_guardians fg
        JOIN people p ON p.id = fg.person_id AND p.deleted_at IS NULL
        WHERE fg.family_id = $1
        ORDER BY fg.is_primary_contact DESC, p.last_name NULLS LAST, p.first_name
        LIMIT 1
        """,
        invoice["family_id"],
    )
    org = await conn.fetchrow("SELECT * FROM org_settings WHERE id = 1")

    from weasyprint import HTML  # noqa: PLC0415

    from ..pdf import safe_url_fetcher  # noqa: PLC0415

    template = _pdf_templates.env.get_template("invoices/_pdf.html")
    html = template.render(
        invoice=invoice,
        line_items=line_items,
        primary_contact=primary_contact,
        org=dict(org) if org else {},
        is_overdue=_is_overdue(invoice["status"], invoice["due_date"]),
    )
    return HTML(string=html, url_fetcher=safe_url_fetcher).write_pdf()


@router.get("/invoices/{invoice_id}/pdf")
async def invoice_pdf(
    invoice_id: UUID,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    invoice = await _invoice_or_404(conn, invoice_id)
    pdf_bytes = await _render_invoice_pdf(conn, invoice)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="{invoice["invoice_number"]}.pdf"',
        },
    )


# ---- Draft mutations -------------------------------------------------------

@router.patch("/invoices/{invoice_id}")
async def update_draft_meta(
    invoice_id: UUID,
    body: InvoiceDraftUpdate,
    user=Depends(require_user),
    conn=Depends(get_conn),
):
    """Edit issue_date / due_date / tax / notes on a draft. Sent/paid/void
    invoices are immutable here — that's intentional, mutating a sent
    invoice would silently change what the family was billed."""
    inv = await conn.fetchrow(
        "SELECT status, issue_date, due_date FROM invoices WHERE id = $1 AND deleted_at IS NULL",
        invoice_id,
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if inv["status"] != "draft":
        raise HTTPException(status_code=400, detail="Only drafts are editable")

    fields = body.model_dump(exclude_unset=True)
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")
    if "notes" in fields:
        fields["notes"] = (fields["notes"] or "").strip() or None

    # Compute the post-PATCH date pair from current row + supplied fields.
    # A PATCH that supplies only one date is checked against the existing
    # row's other date so the merged invoice stays consistent.
    new_issue = fields["issue_date"] if "issue_date" in fields else inv["issue_date"]
    new_due = fields["due_date"] if "due_date" in fields else inv["due_date"]
    if new_issue is not None and new_due is not None and new_due < new_issue:
        raise HTTPException(
            status_code=400,
            detail="due_date must be on or after issue_date.",
        )

    set_sql = ", ".join(f"{col} = ${i+2}" for i, col in enumerate(fields))
    await conn.execute(
        f"UPDATE invoices SET {set_sql} WHERE id = $1",
        invoice_id,
        *fields.values(),
    )
    await _recompute_totals(conn, invoice_id)
    return await invoice_detail(invoice_id, _user=user, conn=conn)


@router.post("/invoices/{invoice_id}/line-items", status_code=201)
async def add_custom_line_item(
    invoice_id: UUID,
    body: CustomLineItem,
    user=Depends(require_user),
    conn=Depends(get_conn),
):
    """Add a 'custom' line — not derived from a time entry or expense."""
    inv = await conn.fetchrow(
        "SELECT status FROM invoices WHERE id = $1 AND deleted_at IS NULL",
        invoice_id,
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if inv["status"] != "draft":
        raise HTTPException(status_code=400, detail="Only drafts are editable")

    line_total = body.quantity * body.unit_price
    max_sort = await conn.fetchval(
        "SELECT COALESCE(MAX(sort_order), -1) FROM invoice_line_items WHERE invoice_id = $1",
        invoice_id,
    )
    await conn.execute(
        """
        INSERT INTO invoice_line_items
          (invoice_id, sort_order, description, quantity, unit_price, line_total,
           source_type)
        VALUES ($1, $2, $3, $4, $5, $6, 'custom'::invoice_line_source)
        """,
        invoice_id, max_sort + 1, body.description.strip(),
        body.quantity, body.unit_price, line_total,
    )
    await _recompute_totals(conn, invoice_id)
    return await invoice_detail(invoice_id, _user=user, conn=conn)


@router.delete("/invoices/{invoice_id}/line-items/{line_id}", status_code=204)
async def delete_line_item(
    invoice_id: UUID,
    line_id: UUID,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    """Drops the line and frees the source time entry / expense back to
    the uninvoiced pool when applicable."""
    inv = await conn.fetchrow(
        "SELECT status FROM invoices WHERE id = $1 AND deleted_at IS NULL",
        invoice_id,
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if inv["status"] != "draft":
        raise HTTPException(status_code=400, detail="Only drafts are editable")

    line = await conn.fetchrow(
        "SELECT source_type, source_id FROM invoice_line_items WHERE id = $1 AND invoice_id = $2",
        line_id, invoice_id,
    )
    if not line:
        raise HTTPException(status_code=404, detail="Line item not found")

    if line["source_type"] == "time" and line["source_id"]:
        await conn.execute(
            "UPDATE time_entries SET invoice_id = NULL WHERE id = $1",
            line["source_id"],
        )
    elif line["source_type"] == "expense" and line["source_id"]:
        await conn.execute(
            "UPDATE expenses SET invoice_id = NULL WHERE id = $1",
            line["source_id"],
        )

    await conn.execute("DELETE FROM invoice_line_items WHERE id = $1", line_id)
    await _recompute_totals(conn, invoice_id)
    return None


# ---- Status transitions ----------------------------------------------------

@router.post("/invoices/{invoice_id}/send")
async def send_invoice(
    invoice_id: UUID,
    user=Depends(require_user),
    conn=Depends(get_conn),
):
    """Flip status draft → sent WITHOUT sending an email. Kept for the
    'I emailed this out of band, just record that it's sent' workflow.
    The /email endpoint is the normal path — it also flips status."""
    inv = await conn.fetchrow(
        "SELECT status FROM invoices WHERE id = $1 AND deleted_at IS NULL FOR UPDATE",
        invoice_id,
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if inv["status"] != "draft":
        raise HTTPException(status_code=400, detail="Only drafts can be sent")
    await conn.execute(
        "UPDATE invoices SET status = 'sent', sent_at = NOW() WHERE id = $1",
        invoice_id,
    )
    return await invoice_detail(invoice_id, _user=user, conn=conn)


@router.post("/invoices/{invoice_id}/email")
async def email_invoice(
    invoice_id: UUID,
    body: EmailInvoiceRequest,
    user=Depends(require_user),
    conn=Depends(get_conn),
):
    """Send the invoice PDF by email and record an audit row. Allowed on
    draft (flips status to sent) and sent (treated as a resend, no
    status change). Refused on paid/void/deleted invoices — those
    aren't current and shouldn't be re-delivered."""
    invoice = await _invoice_or_404(conn, invoice_id)
    if invoice["status"] not in ("draft", "sent", "overdue"):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot email invoice in status '{invoice['status']}'.",
        )

    # Recipient resolution: explicit body.to wins; otherwise prefer the
    # billing contact, fall back to the primary contact, then any
    # guardian with an email. Refuse if no email is on file — the
    # operator should attach one before sending.
    if body.to:
        recipient = body.to
    else:
        recipient = await conn.fetchval(
            """
            SELECT p.email
            FROM family_guardians fg
            JOIN people p ON p.id = fg.person_id AND p.deleted_at IS NULL
            WHERE fg.family_id = $1
              AND p.email IS NOT NULL AND p.email <> ''
            ORDER BY fg.is_billing_contact DESC,
                     fg.is_primary_contact DESC,
                     p.last_name NULLS LAST, p.first_name
            LIMIT 1
            """,
            invoice["family_id"],
        )
        if not recipient:
            raise HTTPException(
                status_code=400,
                detail=(
                    "No recipient email available. Provide `to` explicitly or "
                    "set an email on the family's billing contact."
                ),
            )

    subject = body.subject or f"Invoice {invoice['invoice_number']} from HillCo"
    body_text = body.body or (
        f"Hello,\n\n"
        f"Please find invoice {invoice['invoice_number']} attached. "
        f"Total: ${invoice['total']:.2f}.\n\n"
        f"Thank you.\n"
    )

    pdf_bytes = await _render_invoice_pdf(conn, invoice)

    try:
        message_id = send_email(
            to=recipient,
            cc=body.cc,
            bcc=body.bcc,
            subject=subject,
            body_text=body_text,
            attachments=[
                (f"{invoice['invoice_number']}.pdf", "pdf", pdf_bytes),
            ],
        )
    except EmailSendError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Email send failed: {exc}",
        ) from exc

    await conn.execute(
        """
        INSERT INTO invoice_emails
            (invoice_id, to_address, cc_addresses, bcc_addresses,
             subject, body, sent_by, smtp_message_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        """,
        invoice_id, recipient, list(body.cc), list(body.bcc),
        subject, body_text, user["id"], message_id or None,
    )

    if invoice["status"] == "draft":
        await conn.execute(
            "UPDATE invoices SET status = 'sent', sent_at = NOW() WHERE id = $1",
            invoice_id,
        )

    return await invoice_detail(invoice_id, _user=user, conn=conn)


@router.post("/invoices/{invoice_id}/mark-paid")
async def mark_paid(
    invoice_id: UUID,
    body: MarkPaid,
    user=Depends(require_user),
    conn=Depends(get_conn),
):
    """Records full payment. Partial payments aren't supported — that
    would require a second 'amount remaining' concept and a more
    careful 'overdue' calculation."""
    inv = await conn.fetchrow(
        "SELECT status, total FROM invoices WHERE id = $1 AND deleted_at IS NULL FOR UPDATE",
        invoice_id,
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if inv["status"] not in ("sent", "overdue"):
        raise HTTPException(status_code=400, detail="Only sent invoices can be marked paid")

    paid_amount = body.paid_amount if body.paid_amount is not None else inv["total"]
    if paid_amount != inv["total"]:
        raise HTTPException(
            status_code=400,
            detail=(
                "Paid amount must equal the invoice total. "
                "Partial payments are not supported."
            ),
        )

    await conn.execute(
        """
        UPDATE invoices SET status = 'paid', paid_date = $1, paid_amount = $2
        WHERE id = $3
        """,
        body.paid_date or date.today(), paid_amount, invoice_id,
    )
    return await invoice_detail(invoice_id, _user=user, conn=conn)


@router.post("/invoices/{invoice_id}/void")
async def void_invoice(
    invoice_id: UUID,
    user=Depends(require_user),
    conn=Depends(get_conn),
):
    """Voids draft/sent/overdue invoices and frees their source time /
    expense rows back to the uninvoiced pool. Refusing to void paid
    invoices is intentional — that path needs an explicit refund flow
    rather than the implicit free-and-rebill that would happen here."""
    inv = await conn.fetchrow(
        "SELECT status FROM invoices WHERE id = $1 AND deleted_at IS NULL FOR UPDATE",
        invoice_id,
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if inv["status"] not in ("draft", "sent", "overdue"):
        raise HTTPException(
            status_code=400,
            detail=(
                f"Cannot void an invoice with status '{inv['status']}'. "
                "Only draft, sent, or overdue invoices can be voided."
            ),
        )
    await conn.execute(
        "UPDATE time_entries SET invoice_id = NULL WHERE invoice_id = $1",
        invoice_id,
    )
    await conn.execute(
        "UPDATE expenses SET invoice_id = NULL WHERE invoice_id = $1",
        invoice_id,
    )
    await conn.execute(
        "UPDATE invoices SET status = 'void' WHERE id = $1",
        invoice_id,
    )
    return await invoice_detail(invoice_id, _user=user, conn=conn)


@router.delete("/invoices/{invoice_id}", status_code=204)
async def delete_invoice(
    invoice_id: UUID,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    """Soft delete; only allowed on drafts. Frees the source time /
    expense rows the same way void does."""
    inv = await conn.fetchrow(
        "SELECT status FROM invoices WHERE id = $1 AND deleted_at IS NULL FOR UPDATE",
        invoice_id,
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if inv["status"] != "draft":
        raise HTTPException(status_code=400, detail="Only drafts can be deleted")

    await conn.execute(
        "UPDATE time_entries SET invoice_id = NULL WHERE invoice_id = $1",
        invoice_id,
    )
    await conn.execute(
        "UPDATE expenses SET invoice_id = NULL WHERE invoice_id = $1",
        invoice_id,
    )
    await conn.execute(
        "UPDATE invoices SET deleted_at = NOW() WHERE id = $1",
        invoice_id,
    )
    return None


# Suppress the linter on the unused timedelta import below — kept so future
# default-due-date logic on the SPA stays consistent with hillco-portal's
# 30-day window.
_ = timedelta
