"""Scaffold for the intake Discovery backend plan.

These tests intentionally skip until PR-Backend lands the migration,
Pydantic models, endpoint updates, convert flow, and lifecycle rules.
"""

import pytest

SKIP_REASON = "scaffold - fill in with PR-Backend implementation"
pytestmark = pytest.mark.skip(reason=SKIP_REASON)


def _skip():
    pytest.skip(SKIP_REASON)


# ---- Field validation ----------------------------------------------------


def test_referral_source_rejects_invalid_enum():
    """PATCH /api/intakes/{id} rejects referral_source outside the allowed enum."""
    _skip()


def test_outcome_rejects_invalid_enum():
    """PATCH /api/intakes/{id} rejects outcome outside the allowed enum."""
    _skip()


def test_next_step_owner_rejects_invalid_enum():
    """PATCH /api/intakes/{id} rejects next_step_owner outside the allowed enum."""
    _skip()


def test_decision_makers_jsonb_shape_enforced():
    """decision_makers requires shaped objects with a non-empty name."""
    _skip()


def test_mentions_jsonb_shape_enforced():
    """intake student mentions require non-empty text and a valid kind."""
    _skip()


def test_consent_granted_nullable_three_states():
    """consent_granted round-trips None, True, and False distinctly."""
    _skip()


def test_constraints_jsonb_round_trip():
    """constraints JSONB chip values persist and round-trip unchanged."""
    _skip()


# ---- Outcome state transition -------------------------------------------


def test_outcome_null_to_value_stamps_outcome_at_and_completed_at():
    """Setting outcome from null stamps both outcome_at and completed_at."""
    _skip()


def test_outcome_value_to_null_clears_outcome_at_and_completed_at():
    """Clearing outcome clears both outcome_at and completed_at."""
    _skip()


def test_outcome_transition_in_single_transaction():
    """A mid-transition failure rolls back outcome, outcome_at, and completed_at together."""
    _skip()


# ---- Per-student discovery + candidacy ----------------------------------


def test_intake_student_patch_updates_discovery_fields():
    """PATCH /api/intakes/{id}/students/{person_id} updates per-intake discovery fields."""
    _skip()


def test_intake_student_patch_rejects_student_not_linked_to_intake():
    """Student discovery PATCH rejects students not linked to the intake."""
    _skip()


def test_recommended_engagement_type_validated_against_engagement_types_catalog():
    """recommended_engagement_type must resolve to a live engagement_types code."""
    _skip()


def test_recommended_engagement_type_rejects_soft_deleted_code():
    """recommended_engagement_type rejects soft-deleted engagement_types codes."""
    _skip()


# ---- Convert flow --------------------------------------------------------


def test_convert_requires_outcome_converting():
    """POST /api/intakes/{id}/convert requires outcome='converting'."""
    _skip()


def test_convert_requires_at_least_one_candidate():
    """Convert rejects intakes with no candidate students."""
    _skip()


def test_convert_requires_recommended_engagement_type_per_candidate():
    """Convert rejects candidates missing recommended_engagement_type."""
    _skip()


def test_convert_creates_one_engagement_per_candidate():
    """Convert creates exactly one engagement for each candidate student."""
    _skip()


def test_convert_engagement_status_is_in_progress():
    """Convert-created engagements use status='in_progress', not a nonexistent lead status."""
    _skip()


def test_convert_snapshots_discovery_context_into_intake_snapshot():
    """Convert copies discovery context into engagements.intake_snapshot."""
    _skip()


def test_convert_snapshot_records_source_intake_and_timestamp():
    """intake_snapshot records the source intake id and snapshot timestamp."""
    _skip()


def test_convert_is_idempotent_via_converted_at():
    """A converted_at guard prevents repeat conversion of the same intake."""
    _skip()


def test_convert_rejects_duplicate_active_engagement_for_same_intake_student_type():
    """Convert rejects an existing active engagement for the same intake, student, and type."""
    _skip()


def test_convert_allows_inactive_duplicate_engagement_for_same_student_type():
    """Completed or cancelled prior engagements do not trip the active duplicate guard."""
    _skip()


def test_convert_concurrent_requests_create_no_duplicates():
    """Concurrent convert requests create exactly one engagement per candidate."""
    _skip()


def test_convert_flips_family_lifecycle_to_client():
    """Successful convert flips the family lifecycle_stage to client."""
    _skip()


# ---- Existing-engagement bake-in on intake GET --------------------------


def test_intake_get_includes_active_engagements_per_candidate():
    """GET intake includes in_progress and on_hold engagements per candidate."""
    _skip()


def test_intake_get_excludes_cancelled_and_completed_engagements_from_active_list():
    """GET intake excludes cancelled and completed engagements from existing_engagements."""
    _skip()


def test_intake_get_omits_soft_deleted_engagements_from_active_list():
    """GET intake omits soft-deleted engagements from existing_engagements."""
    _skip()


# ---- Family lifecycle auto-flips ----------------------------------------


def test_decline_outcome_flips_lead_family_to_archived():
    """Declined outcomes archive a lead family only when it has zero active engagements."""
    _skip()


def test_nurture_outcome_flips_lead_family_to_prospect():
    """A nurture outcome flips a lead family to prospect."""
    _skip()


def test_convert_success_flips_family_to_client():
    """Successful convert flips the family lifecycle_stage to client."""
    _skip()


def test_outcome_reversal_does_not_auto_revert_family_stage():
    """Clearing or changing outcome does not automatically reverse family lifecycle_stage."""
    _skip()


def test_archived_decline_does_not_override_family_with_active_engagements():
    """Declined outcome does not archive a family that already has active engagements."""
    _skip()


# ---- Legacy notes / migration compatibility -----------------------------


def test_existing_notes_remain_in_intake_notes_bucket():
    """Legacy intakes.notes is preserved as the general intake notes bucket."""
    _skip()


# ---- Migration / backfill ------------------------------------------------


def test_backfill_completed_with_engagement_sets_outcome_converting():
    """Backfill maps completed intakes with engagement records to outcome='converting'."""
    _skip()


def test_backfill_completed_without_engagement_sets_outcome_no_response():
    """Backfill maps completed intakes without engagement records to outcome='no_response'."""
    _skip()


def test_backfill_families_with_engagement_become_client():
    """Backfill sets families with existing engagements to lifecycle_stage='client'."""
    _skip()


def test_backfill_families_without_engagement_stay_lead():
    """Backfill leaves families without existing engagements at lifecycle_stage='lead'."""
    _skip()
