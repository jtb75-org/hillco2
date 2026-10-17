"""Engagement-scoped intake summary.

Powers the `activity_kind = 'intake_summary'` body component on the
engagement page. The summary aggregates four slices of read-only data
the operator already entered during intake:

  - contacts        — family guardians + roles + addresses (live, from
                      family_guardians; reflects edits made AFTER
                      intake completed)
  - current_school  — student grade + current school (joined to schools
                      for the display name)
  - diagnoses       — student diagnostic flags + autism level
  - goals           — the intake's desired_outcome + per-student
                      discovery (working/not-working/history/etc.)

One endpoint returns all four slices so the SPA can fire a single
query and have every kind-body row on the activities list hit cache.
Engagement existence is required; missing intake/student/family
chunks come back as null rather than 404 so the body component can
render a "not captured yet" affordance.
"""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from ..auth import require_user
from ..db import get_conn

router = APIRouter(prefix="/api", tags=["intake_summary"])


async def _engagement_context(conn, engagement_id: UUID) -> dict:
    row = await conn.fetchrow(
        """
        SELECT id, family_id, student_id, intake_id
        FROM engagements
        WHERE id = $1 AND deleted_at IS NULL
        """,
        engagement_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Engagement not found")
    return dict(row)


async def _contacts(conn, family_id: UUID | None) -> list[dict]:
    """Pulled from family_guardians (not intake_guardians) so the
    summary reflects the operator's latest edits via the engagement
    page's GuardiansCard, not the convert-time snapshot."""
    if family_id is None:
        return []
    rows = await conn.fetch(
        """
        SELECT
          p.id                                       AS person_id,
          TRIM(BOTH ' ' FROM
            COALESCE(p.first_name, '') ||
            CASE WHEN p.last_name IS NOT NULL AND p.last_name <> ''
                 THEN ' ' || p.last_name ELSE '' END
          )                                          AS name,
          p.email,
          p.phone,
          fg.relationship                            AS role,
          fg.is_primary_contact,
          fg.is_billing_contact,
          NULLIF(
            TRIM(BOTH E'\n' FROM
              CONCAT_WS(E'\n',
                NULLIF(p.street1, ''),
                NULLIF(p.street2, ''),
                CASE WHEN COALESCE(p.city, '') <> ''
                       OR COALESCE(p.state, '') <> ''
                       OR COALESCE(p.postal_code, '') <> ''
                     THEN CONCAT_WS(' ',
                            NULLIF(p.city, ''),
                            NULLIF(p.state, ''),
                            NULLIF(p.postal_code, '')
                          )
                     ELSE NULL END
              )
            ),
            ''
          )                                          AS mailing_address
        FROM family_guardians fg
        JOIN people p ON p.id = fg.person_id AND p.deleted_at IS NULL
        WHERE fg.family_id = $1
        ORDER BY
          fg.is_primary_contact DESC,
          fg.is_billing_contact DESC,
          p.last_name NULLS LAST,
          p.first_name
        """,
        family_id,
    )
    return [dict(r) for r in rows]


async def _current_school(conn, student_id: UUID | None) -> dict | None:
    if student_id is None:
        return None
    row = await conn.fetchrow(
        """
        SELECT
          p.id                                       AS student_id,
          TRIM(BOTH ' ' FROM
            COALESCE(p.first_name, '') ||
            CASE WHEN p.last_name IS NOT NULL AND p.last_name <> ''
                 THEN ' ' || p.last_name ELSE '' END
          )                                          AS student_name,
          sd.current_grade,
          sd.current_school_id,
          s.name                                     AS current_school_name,
          s.city                                     AS current_school_city,
          s.state                                    AS current_school_state
        FROM people p
        LEFT JOIN student_details sd ON sd.person_id = p.id
        LEFT JOIN schools s ON s.id = sd.current_school_id
        WHERE p.id = $1 AND p.deleted_at IS NULL
        """,
        student_id,
    )
    return dict(row) if row else None


async def _diagnoses(conn, student_id: UUID | None) -> dict | None:
    if student_id is None:
        return None
    row = await conn.fetchrow(
        """
        SELECT
          p.id                                       AS student_id,
          TRIM(BOTH ' ' FROM
            COALESCE(p.first_name, '') ||
            CASE WHEN p.last_name IS NOT NULL AND p.last_name <> ''
                 THEN ' ' || p.last_name ELSE '' END
          )                                          AS student_name,
          COALESCE(sd.has_504, false)                AS has_504,
          COALESCE(sd.has_iep, false)                AS has_iep,
          COALESCE(sd.has_learning_disability, false) AS has_learning_disability,
          COALESCE(sd.has_adhd, false)               AS has_adhd,
          COALESCE(sd.has_intellectual_disability, false) AS has_intellectual_disability,
          COALESCE(sd.has_health_impairment, false)  AS has_health_impairment,
          COALESCE(sd.has_emotional_disturbance, false) AS has_emotional_disturbance,
          sd.autism_level,
          sd.learning_disability_notes,
          sd.intellectual_disability_notes,
          sd.health_impairment_notes,
          sd.emotional_disturbance_notes
        FROM people p
        LEFT JOIN student_details sd ON sd.person_id = p.id
        WHERE p.id = $1 AND p.deleted_at IS NULL
        """,
        student_id,
    )
    return dict(row) if row else None


async def _goals(conn, intake_id: UUID | None, student_id: UUID | None) -> dict | None:
    """Intake-sourced free-form text. If the engagement has no intake
    (legacy / manually created), there's nothing to surface."""
    if intake_id is None:
        return None
    intake_row = await conn.fetchrow(
        """
        SELECT desired_outcome, family_context_notes, constraints
        FROM intakes
        WHERE id = $1 AND deleted_at IS NULL
        """,
        intake_id,
    )
    if intake_row is None:
        return None
    out = dict(intake_row)
    # constraints is JSONB — asyncpg returns a string without a codec.
    raw = out.get("constraints")
    if isinstance(raw, str):
        import json

        try:
            out["constraints"] = json.loads(raw)
        except json.JSONDecodeError:
            out["constraints"] = []
    elif raw is None:
        out["constraints"] = []
    out["student_discovery"] = await _student_discovery(conn, intake_id, student_id)
    return out


async def _student_discovery(
    conn, intake_id: UUID, student_id: UUID | None
) -> dict | None:
    """The per-student discovery columns from intake_students. If the
    engagement names a student, we focus on that one; otherwise return
    nothing (multi-student summaries belong on the intake page)."""
    if student_id is None:
        return None
    row = await conn.fetchrow(
        """
        SELECT working, not_working, history, school_fit, supports_tried
        FROM intake_students
        WHERE intake_id = $1 AND person_id = $2
        """,
        intake_id,
        student_id,
    )
    return dict(row) if row else None


@router.get("/engagements/{engagement_id}/intake-summary")
async def engagement_intake_summary(
    engagement_id: UUID,
    _user=Depends(require_user),
    conn=Depends(get_conn),
):
    """Aggregated read-only view of the four intake slices for one
    engagement. Frontend caches this once and slices it per kind-body."""
    eng = await _engagement_context(conn, engagement_id)
    contacts = await _contacts(conn, eng["family_id"])
    current_school = await _current_school(conn, eng["student_id"])
    diagnoses = await _diagnoses(conn, eng["student_id"])
    goals = await _goals(conn, eng["intake_id"], eng["student_id"])
    return {
        "engagement_id": str(eng["id"]),
        "family_id": str(eng["family_id"]) if eng["family_id"] else None,
        "student_id": str(eng["student_id"]) if eng["student_id"] else None,
        "intake_id": str(eng["intake_id"]) if eng["intake_id"] else None,
        "contacts": contacts,
        "current_school": current_school,
        "diagnoses": diagnoses,
        "goals": goals,
    }
