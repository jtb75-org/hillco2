/** Shared types + display maps for the intake Discovery page.
 *  Mirrors the Literal enums in app/routes/intakes.py. */

export type ReferralSource =
  | "word_of_mouth"
  | "pediatrician"
  | "therapist"
  | "school"
  | "search"
  | "returning"
  | "other";

export type Outcome =
  | "converting"
  | "nurture"
  | "declined_by_family"
  | "declined_by_hillco"
  | "no_response"
  | "duplicate";

export type NextStepOwner = "consultant" | "family" | "awaiting_records";

export type MentionKind = "school" | "professional" | "program" | "other";

export type LifecycleStage = "lead" | "prospect" | "client" | "archived";

export const REFERRAL_SOURCE_LABEL: Record<ReferralSource, string> = {
  word_of_mouth: "Word of mouth — friend / family",
  pediatrician: "Pediatrician",
  therapist: "Therapist / psychologist",
  school: "School counselor",
  search: "Google / web search",
  returning: "Returning client",
  other: "Other",
};

export const OUTCOME_LABEL: Record<Outcome, string> = {
  converting: "Converting to engagement",
  nurture: "Nurture / follow up later",
  declined_by_family: "Declined — family passed",
  declined_by_hillco: "Declined — not a fit (HillCo)",
  no_response: "No response after intake",
  duplicate: "Duplicate / test record",
};

export const NEXT_STEP_OWNER_LABEL: Record<NextStepOwner, string> = {
  consultant: "Consultant (us)",
  family: "Family",
  awaiting_records: "Awaiting external records",
};

export const MENTION_KIND_LABEL: Record<MentionKind, string> = {
  school: "School",
  professional: "Professional",
  program: "Program",
  other: "Other",
};

// Short label + chip color for the header Status chip. Mirrors the
// mockup's STATUS_DISPLAY.
export const OUTCOME_STATUS_DISPLAY: Record<
  Outcome,
  {
    label: string;
    color: "default" | "primary" | "success" | "warning" | "error";
  }
> = {
  converting: { label: "Converting", color: "success" },
  nurture: { label: "Nurture", color: "warning" },
  declined_by_family: { label: "Declined (family)", color: "default" },
  declined_by_hillco: { label: "Declined (HillCo)", color: "default" },
  no_response: { label: "No response", color: "default" },
  duplicate: { label: "Duplicate", color: "default" },
};

export interface Mention {
  text: string;
  kind: MentionKind;
}

export interface ExistingEngagement {
  id: string;
  engagement_type: string;
  status: "in_progress" | "on_hold";
  start_date: string | null;
}

/** Full per-intake-student row returned by GET /api/intakes/:id. */
export interface IntakeStudent {
  id: string;
  name: string;
  dob: string | null;
  current_grade: string | null;
  current_school_id: string | null;
  has_504: boolean;
  has_iep: boolean;
  has_learning_disability: boolean;
  has_adhd: boolean;
  has_intellectual_disability: boolean;
  has_health_impairment: boolean;
  has_emotional_disturbance: boolean;
  autism_level: 1 | 2 | 3 | null;
  // Per-meeting discovery
  working: string | null;
  not_working: string | null;
  history: string | null;
  school_fit: string | null;
  supports_tried: string | null;
  candidate: boolean;
  recommended_engagement_type: string | null;
  mentions: Mention[];
  existing_engagements: ExistingEngagement[];
}

/** Full intake row returned by GET /api/intakes/:id. */
export interface IntakeDetail {
  id: string;
  family_id: string;
  intake_date: string;
  consultant_id: string | null;
  notes: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  // Family context
  referral_source: ReferralSource | null;
  desired_outcome: string | null;
  constraints: string[];
  consent_granted: boolean | null;
  family_context_notes: string | null;
  // Outcome + next-step
  outcome: Outcome | null;
  outcome_at: string | null;
  disposition_reason: string | null;
  next_step_owner: NextStepOwner | null;
  next_step_due: string | null;
  blocker: string | null;
  converted_at: string | null;
  // Members
  guardians: IntakeGuardian[];
  students: IntakeStudent[];
}

export interface IntakeGuardian {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string;
  is_primary_contact: boolean;
  is_billing_contact: boolean;
  mailing_address: string | null;
  billing_address: string | null;
}

export interface EngagementTypeOption {
  code: string;
  label: string;
}
