"""Shared Pydantic-friendly regex constants for cross-route reuse.

Lives here rather than inline in route modules so route-A and route-B
can both enforce the same shape on the same kind of field (e.g.,
email + ZIP appear on guardians, school workers, and ad-hoc contacts).
"""

# Permissive RFC-shaped email check. Pydantic's EmailStr blocks reserved
# TLDs like `.test` and `.example`, which every fixture in the test
# suite uses, so we keep this loose-but-typo-catching pattern instead.
EMAIL_PATTERN = r"^[^\s@]+@[^\s@]+\.[^\s@]+$"

# US ZIP — five digits or `NNNNN-NNNN`. Field label can say "ZIP /
# postal" but the validator is US-only by intent; revisit when
# international clients show up.
US_ZIP_PATTERN = r"^\d{5}(-\d{4})?$"
