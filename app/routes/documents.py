import logging
import re
from typing import Literal
from uuid import UUID, uuid4

from botocore.exceptions import ClientError
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse

from .. import s3
from ..auth import require_user
from ..config import settings
from ..db import get_conn

router = APIRouter(prefix="/api", tags=["documents"])
logger = logging.getLogger(__name__)


OwnerType = Literal["family", "student", "engagement", "school", "note", "contact"]
DocumentKind = Literal[
    "intake", "iep", "evaluation", "report_card", "medical",
    "recommendation", "invoice", "receipt", "scorecard", "other",
]

# Maps owner_type to (table, has_soft_delete). Used to verify uploaded
# documents reference an owner that actually exists.
_OWNER_TABLES: dict[str, tuple[str, bool]] = {
    "family": ("families", True),
    "student": ("students", True),
    "engagement": ("engagements", True),
    "school": ("schools", True),
    "note": ("notes", False),
    "contact": ("contacts", True),
}

ALLOWED_UPLOAD_EXTENSIONS = {
    "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
    "txt", "csv", "rtf", "odt",
    "png", "jpg", "jpeg", "gif", "heic", "heif", "webp",
}


# ---- Helpers ---------------------------------------------------------------

def _safe_filename(name: str) -> str:
    base = name.rsplit("/", 1)[-1].rsplit("\\", 1)[-1]
    base = re.sub(r"[^A-Za-z0-9._-]+", "_", base)
    return base[:200] or "file"


def _s3_key(owner_type: str, owner_id: UUID, doc_id: UUID, filename: str) -> str:
    return f"{owner_type}/{owner_id}/{doc_id}/{_safe_filename(filename)}"


async def _verify_owner(conn, owner_type: str, owner_id: UUID):
    if owner_type not in _OWNER_TABLES:
        raise HTTPException(status_code=400, detail="Invalid owner_type")
    table, has_soft_delete = _OWNER_TABLES[owner_type]
    sql = f"SELECT 1 FROM {table} WHERE id = $1"
    if has_soft_delete:
        sql += " AND deleted_at IS NULL"
    if not await conn.fetchval(sql, owner_id):
        raise HTTPException(status_code=404, detail=f"{owner_type} owner not found")


# ---- List / search ---------------------------------------------------------

@router.get("/documents")
async def list_documents(
    owner_type: OwnerType | None = Query(None),
    owner_id: UUID | None = Query(None),
    kind: DocumentKind | None = Query(None),
    q: str = Query("", description="Substring search over filename"),
    limit: int = Query(200, ge=1, le=500),
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    clauses = ["d.deleted_at IS NULL"]
    args: list = []
    if owner_type is not None:
        args.append(owner_type)
        clauses.append(f"d.owner_type = ${len(args)}::document_owner_type")
    if owner_id is not None:
        args.append(owner_id)
        clauses.append(f"d.owner_id = ${len(args)}")
    if kind is not None:
        args.append(kind)
        clauses.append(f"d.kind = ${len(args)}::document_kind")
    q = q.strip()
    if q:
        args.append(f"%{q}%")
        clauses.append(f"d.filename ILIKE ${len(args)}")

    args.append(limit)
    rows = await conn.fetch(
        f"""
        SELECT
          d.id, d.kind, d.filename, d.content_type, d.byte_size,
          d.created_at, d.owner_type, d.owner_id, d.uploaded_by,
          u.name AS uploaded_by_name,
          CASE d.owner_type
            WHEN 'family'     THEN (SELECT household_name FROM families  WHERE id = d.owner_id)
            WHEN 'student'    THEN (SELECT name           FROM students  WHERE id = d.owner_id)
            WHEN 'school'     THEN (SELECT name           FROM schools   WHERE id = d.owner_id)
            WHEN 'contact'    THEN (SELECT name           FROM contacts  WHERE id = d.owner_id)
            WHEN 'engagement' THEN (SELECT f.household_name FROM engagements e
                                     JOIN families f ON f.id = e.family_id
                                     WHERE e.id = d.owner_id)
            ELSE NULL
          END AS owner_label
        FROM documents d
        LEFT JOIN users u ON u.id = d.uploaded_by
        WHERE {" AND ".join(clauses)}
        ORDER BY d.created_at DESC
        LIMIT ${len(args)}
        """,
        *args,
    )
    return [dict(r) for r in rows]


@router.get("/documents/owner-search")
async def owner_search(
    q: str = Query(..., min_length=1, description="Substring search over owner names"),
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    """Typeahead helper for the upload UI — surfaces families, students,
    schools, and engagements whose names match the query."""
    pat = f"%{q.strip()}%"
    fams = await conn.fetch(
        """
        SELECT id, household_name AS name
        FROM families
        WHERE deleted_at IS NULL AND household_name ILIKE $1
        ORDER BY household_name LIMIT 8
        """,
        pat,
    )
    stus = await conn.fetch(
        """
        SELECT s.id, s.name, s.current_grade,
               f.id AS family_id, f.household_name
        FROM students s
        JOIN families f ON f.id = s.family_id AND f.deleted_at IS NULL
        WHERE s.deleted_at IS NULL AND s.name ILIKE $1
        ORDER BY s.name LIMIT 8
        """,
        pat,
    )
    schs = await conn.fetch(
        """
        SELECT id, name, location
        FROM schools
        WHERE deleted_at IS NULL AND name ILIKE $1
        ORDER BY name LIMIT 8
        """,
        pat,
    )
    engs = await conn.fetch(
        """
        SELECT e.id, e.engagement_type, e.start_date,
               f.id AS family_id, f.household_name
        FROM engagements e
        JOIN families f ON f.id = e.family_id AND f.deleted_at IS NULL
        WHERE e.deleted_at IS NULL AND f.household_name ILIKE $1
        ORDER BY f.household_name, e.start_date DESC LIMIT 6
        """,
        pat,
    )
    return {
        "families": [dict(r) for r in fams],
        "students": [dict(r) for r in stus],
        "schools": [dict(r) for r in schs],
        "engagements": [dict(r) for r in engs],
    }


# ---- Merged-by-owner helpers (used by detail pages) ------------------------

@router.get("/families/{family_id}/documents")
async def family_merged_documents(
    family_id: UUID,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    """Family docs + every active student in the family's docs, with a
    source_label so the UI can group/label them."""
    if not await conn.fetchval(
        "SELECT 1 FROM families WHERE id = $1 AND deleted_at IS NULL",
        family_id,
    ):
        raise HTTPException(status_code=404, detail="Family not found")
    rows = await conn.fetch(
        """
        SELECT d.id, d.kind, d.filename, d.content_type, d.byte_size,
               d.created_at, d.owner_type, d.owner_id, d.uploaded_by,
               u.name AS uploaded_by_name,
               CASE
                 WHEN d.owner_type = 'family'  THEN 'This family'
                 WHEN d.owner_type = 'student' THEN s.name
                 ELSE d.owner_type::text
               END AS source_label
        FROM documents d
        LEFT JOIN students s ON d.owner_type = 'student' AND s.id = d.owner_id
        LEFT JOIN users u ON u.id = d.uploaded_by
        WHERE d.deleted_at IS NULL AND (
              (d.owner_type = 'family'  AND d.owner_id = $1)
           OR (d.owner_type = 'student' AND d.owner_id IN (
                  SELECT id FROM students
                  WHERE family_id = $1 AND deleted_at IS NULL))
        )
        ORDER BY
          CASE d.owner_type WHEN 'family' THEN 1 WHEN 'student' THEN 2 ELSE 3 END,
          d.created_at DESC
        """,
        family_id,
    )
    return [dict(r) for r in rows]


@router.get("/engagements/{engagement_id}/documents")
async def engagement_merged_documents(
    engagement_id: UUID,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    """Engagement docs + family docs + every student-on-the-engagement's
    docs, with a source_label."""
    if not await conn.fetchval(
        "SELECT 1 FROM engagements WHERE id = $1 AND deleted_at IS NULL",
        engagement_id,
    ):
        raise HTTPException(status_code=404, detail="Engagement not found")
    rows = await conn.fetch(
        """
        WITH ctx AS (
          SELECT e.id AS engagement_id, e.family_id,
                 ARRAY[e.student_id] AS student_ids
          FROM engagements e
          WHERE e.id = $1 AND e.deleted_at IS NULL
        )
        SELECT d.id, d.kind, d.filename, d.content_type, d.byte_size,
               d.created_at, d.owner_type, d.owner_id, d.uploaded_by,
               u.name AS uploaded_by_name,
               CASE
                 WHEN d.owner_type = 'engagement' THEN 'This engagement'
                 WHEN d.owner_type = 'family'     THEN f.household_name || ' family'
                 WHEN d.owner_type = 'student'    THEN s.name
                 WHEN d.owner_type = 'note'       THEN 'Note'
                 ELSE d.owner_type::text
               END AS source_label
        FROM ctx
        JOIN documents d
          ON d.deleted_at IS NULL AND (
               (d.owner_type = 'engagement' AND d.owner_id = ctx.engagement_id)
            OR (d.owner_type = 'family'     AND d.owner_id = ctx.family_id)
            OR (d.owner_type = 'student'    AND d.owner_id = ANY(ctx.student_ids))
          )
        LEFT JOIN families f ON d.owner_type = 'family'  AND f.id = d.owner_id
        LEFT JOIN students s ON d.owner_type = 'student' AND s.id = d.owner_id
        LEFT JOIN users u    ON u.id = d.uploaded_by
        ORDER BY
          CASE d.owner_type
            WHEN 'engagement' THEN 1
            WHEN 'family'     THEN 2
            WHEN 'student'    THEN 3
            ELSE 4
          END,
          d.created_at DESC
        """,
        engagement_id,
    )
    return [dict(r) for r in rows]


# ---- Upload ----------------------------------------------------------------

@router.post("/documents/upload", status_code=201)
async def upload_document(
    owner_type: OwnerType = Form(...),
    owner_id: UUID = Form(...),
    kind: DocumentKind = Form("other"),
    file: UploadFile = File(...),
    user=Depends(require_user),
    conn=Depends(get_conn),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="filename is required")
    await _verify_owner(conn, owner_type, owner_id)

    filename = _safe_filename(file.filename)
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in ALLOWED_UPLOAD_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=(
                f"File type '.{ext}' is not allowed. "
                f"Allowed: {', '.join(sorted(ALLOWED_UPLOAD_EXTENSIONS))}"
            ),
        )

    # Read size by seeking to end (avoids buffering the whole file in memory).
    file.file.seek(0, 2)
    byte_size = file.file.tell()
    file.file.seek(0)
    if byte_size == 0:
        raise HTTPException(status_code=400, detail="Empty file")
    if byte_size > settings.upload_max_bytes:
        raise HTTPException(
            status_code=413,
            detail=(
                f"File too large ({byte_size} bytes). "
                f"Max upload size is {settings.upload_max_bytes // (1024 * 1024)} MB."
            ),
        )

    doc_id = uuid4()
    key = _s3_key(owner_type, owner_id, doc_id, filename)
    content_type = file.content_type
    s3.put(key, file.file, content_type=content_type)

    row = await conn.fetchrow(
        """
        INSERT INTO documents (
          id, owner_type, owner_id, kind, filename, content_type,
          byte_size, s3_key, uploaded_by
        ) VALUES (
          $1, $2::document_owner_type, $3, $4::document_kind, $5, $6, $7, $8, $9
        )
        RETURNING id, owner_type, owner_id, kind, filename, content_type,
                  byte_size, uploaded_by, created_at, updated_at
        """,
        doc_id, owner_type, owner_id, kind, filename, content_type,
        byte_size, key, user["id"],
    )
    return dict(row)


# ---- Download (stream through the app) -------------------------------------

@router.get("/documents/{doc_id}/download")
async def download_document(
    doc_id: UUID,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    """Stream the object through the app instead of redirecting to a
    presigned S3 URL. Keeps every read inside the app's audit perimeter,
    avoids leaking the URL into browser history/Referer, and lets us add
    a documents.read audit row in one place later."""
    doc = await conn.fetchrow(
        """
        SELECT s3_key, filename, content_type
        FROM documents
        WHERE id = $1 AND deleted_at IS NULL
        """,
        doc_id,
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    try:
        obj = s3.get_object(doc["s3_key"])
    except ClientError as exc:
        # The DB row says this document exists; S3 disagrees. Surface the
        # integrity gap to the operator instead of returning a confusing
        # 500. NoSuchKey/404 from S3 -> 410 Gone (was there, no longer
        # recoverable). Other AWS errors fall through to 502.
        code = exc.response.get("Error", {}).get("Code", "")
        logger.warning(
            "documents.download integrity gap: doc_id=%s s3_key=%s code=%s",
            doc_id, doc["s3_key"], code,
        )
        if code in ("NoSuchKey", "404"):
            raise HTTPException(status_code=410, detail="Document is gone") from exc
        raise HTTPException(status_code=502, detail="Document storage unavailable") from exc
    body = obj["Body"]

    def stream():
        try:
            while True:
                chunk = body.read(64 * 1024)
                if not chunk:
                    break
                yield chunk
        finally:
            body.close()

    headers = {
        "Content-Disposition": (
            f'attachment; filename="{_safe_filename(doc["filename"])}"'
        ),
        "Cache-Control": "private, no-store",
    }
    if obj.get("ContentLength"):
        headers["Content-Length"] = str(obj["ContentLength"])

    return StreamingResponse(
        stream(),
        media_type=doc["content_type"] or "application/octet-stream",
        headers=headers,
    )


# ---- Delete (soft, leaves S3 object for later GC) --------------------------

@router.delete("/documents/{doc_id}", status_code=204)
async def delete_document(
    doc_id: UUID,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    if not await conn.fetchval(
        "SELECT 1 FROM documents WHERE id = $1 AND deleted_at IS NULL",
        doc_id,
    ):
        raise HTTPException(status_code=404, detail="Document not found")
    await conn.execute(
        "UPDATE documents SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL",
        doc_id,
    )
    return None
