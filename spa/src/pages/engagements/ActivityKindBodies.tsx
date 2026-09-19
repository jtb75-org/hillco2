import { useEffect, useState } from "react";
import {
  Autocomplete,
  Box,
  Chip,
  IconButton,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import CloseIcon from "@mui/icons-material/Close";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { RichTextEditor } from "../../components/RichTextEditor";
import { useSnackbar } from "../../components/Snackbar";

import type { ActivityRow } from "./ActivitiesCard";

/** Which activity_kinds render an expanded body below the row. The
 *  external-table kinds (school_visit, school_recommendation) keep
 *  their data on dedicated tables (school_visits, school_recommendations)
 *  linked from engagement_tasks via engagement_task_id; the body
 *  fetches + edits that row, not structured_content. */
export const KIND_HAS_BODY: Record<ActivityRow["activity_kind"], boolean> = {
  task: false,
  document_review: true,
  best_environment: true,
  feedback_meeting: true,
  school_visit: true,
  school_recommendation: true,
  intake_summary: true,
};

export function ActivityKindBody({
  row,
  engagementId,
  onCommit,
}: {
  row: ActivityRow;
  engagementId: string;
  onCommit: (next: Record<string, unknown>) => void;
}) {
  switch (row.activity_kind) {
    case "document_review":
      return (
        <DocumentReviewBody
          content={row.structured_content as DocReviewContent}
          engagementId={engagementId}
          onCommit={(next) => onCommit(next as unknown as Record<string, unknown>)}
        />
      );
    case "best_environment":
      return (
        <BestEnvironmentBody
          content={row.structured_content as BestEnvContent}
          onCommit={(next) => onCommit(next as unknown as Record<string, unknown>)}
        />
      );
    case "feedback_meeting":
      return (
        <FeedbackMeetingBody
          content={row.structured_content as FeedbackContent}
          onCommit={(next) => onCommit(next as unknown as Record<string, unknown>)}
        />
      );
    case "school_visit":
      return <SchoolVisitBody taskId={row.id} engagementId={engagementId} />;
    case "school_recommendation":
      return <SchoolRecommendationBody taskId={row.id} engagementId={engagementId} />;
    case "intake_summary":
      return (
        <IntakeSummaryBody
          section={
            (row.structured_content as { section?: IntakeSummarySection })
              ?.section ?? null
          }
          engagementId={engagementId}
        />
      );
    default:
      return null;
  }
}

// ---- best_environment ------------------------------------------------------

interface BestEnvContent {
  curriculum?: string;
  placement_size?: string;
  social_emotional?: string;
  extras?: string;
}

const BEST_ENV_FIELDS: Array<{ key: keyof BestEnvContent; label: string; placeholder: string }> = [
  { key: "curriculum",       label: "Curriculum",         placeholder: "What kind of academic program does this student need?" },
  { key: "placement_size",   label: "Placement size",     placeholder: "Class size, school size, ratios…" },
  { key: "social_emotional", label: "Social-emotional",   placeholder: "Support structure, peer fit, social goals…" },
  { key: "extras",           label: "Extras",             placeholder: "Anything else that defines the ideal environment." },
];

function BestEnvironmentBody({
  content,
  onCommit,
}: {
  content: BestEnvContent;
  onCommit: (next: BestEnvContent) => void;
}) {
  return (
    <FieldGrid
      fields={BEST_ENV_FIELDS}
      content={content}
      onCommit={onCommit}
    />
  );
}

// ---- feedback_meeting ------------------------------------------------------

interface FeedbackContent {
  recommendations?: string;
  admissions?: string;
  follow_on?: string;
}

const FEEDBACK_FIELDS: Array<{ key: keyof FeedbackContent; label: string; placeholder: string }> = [
  { key: "recommendations", label: "Recommendations",     placeholder: "What the consultant is suggesting." },
  { key: "admissions",      label: "Admissions strategy", placeholder: "Application strategy, deadlines, who's leading the outreach…" },
  { key: "follow_on",       label: "Follow-on actions",   placeholder: "What happens after this meeting." },
];

function FeedbackMeetingBody({
  content,
  onCommit,
}: {
  content: FeedbackContent;
  onCommit: (next: FeedbackContent) => void;
}) {
  return (
    <FieldGrid
      fields={FEEDBACK_FIELDS}
      content={content}
      onCommit={onCommit}
    />
  );
}

// Shared rich-text grid used by best_environment + feedback_meeting. Each
// field carries its own draft; commit fires onBlur with the full merged
// structured_content so the backend's full-replace PATCH stays consistent.
function FieldGrid<C>({
  fields,
  content,
  onCommit,
}: {
  fields: Array<{ key: keyof C; label: string; placeholder: string }>;
  content: C;
  onCommit: (next: C) => void;
}) {
  return (
    <Stack spacing={2}>
      {fields.map(({ key, label, placeholder }) => {
        const initial = (content[key] as string | undefined) ?? "";
        return (
          <Box key={String(key)}>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: "block", mb: 0.5, fontWeight: 600 }}
            >
              {label}
            </Typography>
            <RichBodyEditor
              initial={initial}
              placeholder={placeholder}
              onCommit={(html) => onCommit({ ...content, [key]: html } as C)}
            />
          </Box>
        );
      })}
    </Stack>
  );
}

function RichBodyEditor({
  initial,
  placeholder,
  onCommit,
}: {
  initial: string;
  placeholder?: string;
  onCommit: (html: string) => void;
}) {
  const [value, setValue] = useState(initial);
  // Re-sync on parent refetch so concurrent edits don't get clobbered.
  useEffect(() => {
    setValue(initial);
  }, [initial]);
  return (
    <Box
      sx={{ display: "flex" }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          if (value !== initial) onCommit(value);
        }
      }}
    >
      <RichTextEditor
        value={value}
        onChange={setValue}
        placeholder={placeholder}
        minRows={3}
      />
    </Box>
  );
}

// ---- document_review -------------------------------------------------------

interface DocReviewContent {
  educational_doc_ids?: string[];
  medical_doc_ids?: string[];
}

interface DocumentOption {
  id: string;
  kind: string;
  filename: string;
  source_label: string;
}

function DocumentReviewBody({
  content,
  engagementId,
  onCommit,
}: {
  content: DocReviewContent;
  engagementId: string;
  onCommit: (next: DocReviewContent) => void;
}) {
  const docs = useQuery<DocumentOption[], Error>({
    queryKey: ["engagements", engagementId, "documents"],
    queryFn: async () => {
      const res = await fetch(`/api/engagements/${engagementId}/documents`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load documents.");
      return res.json();
    },
  });

  const educationalIds = content.educational_doc_ids ?? [];
  const medicalIds = content.medical_doc_ids ?? [];

  return (
    <Stack spacing={2}>
      <DocPicker
        label="Educational documents"
        helper="IEP, 504, evaluations, prior school records."
        selectedIds={educationalIds}
        options={docs.data ?? []}
        loading={docs.isPending}
        onChange={(next) =>
          onCommit({ ...content, educational_doc_ids: next })
        }
      />
      <DocPicker
        label="Medical documents"
        helper="Diagnoses, medication, therapy reports."
        selectedIds={medicalIds}
        options={docs.data ?? []}
        loading={docs.isPending}
        onChange={(next) =>
          onCommit({ ...content, medical_doc_ids: next })
        }
      />
    </Stack>
  );
}

function DocPicker({
  label,
  helper,
  selectedIds,
  options,
  loading,
  onChange,
}: {
  label: string;
  helper: string;
  selectedIds: string[];
  options: DocumentOption[];
  loading: boolean;
  onChange: (next: string[]) => void;
}) {
  const byId = new Map(options.map((d) => [d.id, d]));
  const selected = selectedIds
    .map((id) => byId.get(id))
    .filter((d): d is DocumentOption => !!d);
  // Only allow picking documents that aren't already selected in THIS
  // bucket — picking a doc as both educational and medical is allowed
  // and intentional, so we don't filter on the OTHER bucket.
  const availableForAdd = options.filter((d) => !selectedIds.includes(d.id));

  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", fontWeight: 600 }}>
        {label}
      </Typography>
      <Typography variant="caption" color="text.disabled" sx={{ display: "block", mb: 0.75 }}>
        {helper}
      </Typography>
      <Stack direction="row" useFlexGap flexWrap="wrap" sx={{ gap: 0.75, mb: 1 }}>
        {selected.length === 0 ? (
          <Typography variant="caption" color="text.disabled">
            None attached yet.
          </Typography>
        ) : (
          selected.map((d) => (
            <Chip
              key={d.id}
              size="small"
              icon={<DescriptionOutlinedIcon fontSize="small" />}
              label={
                <Box component="span" sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                  <Box
                    component="a"
                    href={`/api/documents/${d.id}/download`}
                    target="_blank"
                    rel="noreferrer"
                    sx={{
                      color: "inherit",
                      textDecoration: "none",
                      "&:hover": { textDecoration: "underline" },
                    }}
                  >
                    {d.filename}
                  </Box>
                  <Typography component="span" variant="caption" color="text.disabled">
                    · {d.source_label}
                  </Typography>
                </Box>
              }
              onDelete={() => onChange(selectedIds.filter((id) => id !== d.id))}
              deleteIcon={
                <IconButton size="small" sx={{ p: 0 }}>
                  <CloseIcon fontSize="small" />
                </IconButton>
              }
              sx={{ height: "auto", py: 0.25 }}
            />
          ))
        )}
      </Stack>
      <Autocomplete
        size="small"
        options={availableForAdd}
        loading={loading}
        getOptionLabel={(d) => `${d.filename} · ${d.source_label}`}
        value={null}
        onChange={(_e, d) => {
          if (d) onChange([...selectedIds, d.id]);
        }}
        renderInput={(params) => (
          <TextField {...params} placeholder="Attach a document…" />
        )}
        renderOption={(props, d) => (
          <li {...props} key={d.id}>
            <Stack spacing={0.25} sx={{ width: "100%" }}>
              <Typography variant="body2">{d.filename}</Typography>
              <Typography variant="caption" color="text.secondary">
                {d.source_label} · {d.kind}
              </Typography>
            </Stack>
          </li>
        )}
      />
    </Box>
  );
}

// ---- school_visit ----------------------------------------------------------

interface VisitRow {
  id: string;
  engagement_id: string;
  school_id: string;
  school_name: string;
  visit_date: string | null;
  attendees: string | null;
  facts_notes: string | null;
  opinion_notes: string | null;
  hours: string | null;
  engagement_task_id: string | null;
}

function SchoolVisitBody({
  taskId,
  engagementId,
}: {
  taskId: string;
  engagementId: string;
}) {
  const visits = useQuery<VisitRow[], Error>({
    queryKey: ["engagements", engagementId, "visits"],
    queryFn: async () => {
      const res = await fetch(`/api/engagements/${engagementId}/visits`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load visits.");
      return res.json();
    },
  });

  const visit = visits.data?.find((v) => v.engagement_task_id === taskId) ?? null;

  if (visits.isPending) {
    return <Typography variant="body2" color="text.disabled">Loading visit…</Typography>;
  }
  if (!visit) {
    return (
      <Typography variant="body2" color="text.disabled">
        This activity isn't linked to a school visit row. (Was the task created
        before A2's atomic-create endpoint, or was the visit deleted?)
      </Typography>
    );
  }

  return (
    <VisitEditor
      visit={visit}
      onSaved={() =>
        visits.refetch()
      }
    />
  );
}

function VisitEditor({
  visit,
  onSaved,
}: {
  visit: VisitRow;
  onSaved: () => void;
}) {
  const snackbar = useSnackbar();
  const qc = useQueryClient();
  const patch = useMutation({
    mutationFn: async (body: Partial<VisitRow>) => {
      const res = await fetch(`/api/visits/${visit.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { detail?: string }).detail ?? "Update failed.");
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["engagements", visit.engagement_id, "visits"] });
      onSaved();
    },
    onError: (e: Error) => snackbar.show(e.message, "error"),
  });
  return (
    <Stack spacing={1.5}>
      <Typography variant="caption" color="text.secondary">
        At <strong>{visit.school_name}</strong>
      </Typography>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
        <Box sx={{ flex: 1 }}>
          <FieldLabel>Visit date</FieldLabel>
          <TextField
            size="small"
            fullWidth
            type="date"
            value={visit.visit_date ?? ""}
            onChange={(e) => patch.mutate({ visit_date: e.target.value || null })}
          />
        </Box>
        <Box sx={{ flex: 1 }}>
          <FieldLabel>Hours</FieldLabel>
          <TextField
            size="small"
            fullWidth
            type="number"
            inputProps={{ step: "0.25", min: 0 }}
            defaultValue={visit.hours ?? ""}
            onBlur={(e) => {
              const next = e.target.value === "" ? null : e.target.value;
              if (next !== visit.hours) patch.mutate({ hours: next });
            }}
          />
        </Box>
        <Box sx={{ flex: 2 }}>
          <FieldLabel>Attendees (free text)</FieldLabel>
          <TextField
            size="small"
            fullWidth
            placeholder="e.g. Admissions director, Maria S., Mr. Kelly"
            defaultValue={visit.attendees ?? ""}
            onBlur={(e) => {
              const next = e.target.value.trim() || null;
              if (next !== visit.attendees) patch.mutate({ attendees: next });
            }}
          />
        </Box>
      </Stack>
      <Box>
        <FieldLabel>Facts</FieldLabel>
        <RichBodyEditor
          initial={visit.facts_notes ?? ""}
          placeholder="What we saw — class sizes, schedule, programs offered…"
          onCommit={(html) => patch.mutate({ facts_notes: html })}
        />
      </Box>
      <Box>
        <FieldLabel>Opinion</FieldLabel>
        <RichBodyEditor
          initial={visit.opinion_notes ?? ""}
          placeholder="Our read — fit assessment, concerns, gut take…"
          onCommit={(html) => patch.mutate({ opinion_notes: html })}
        />
      </Box>
    </Stack>
  );
}

// ---- school_recommendation -------------------------------------------------

type RecStatus =
  | "considered"
  | "recommended"
  | "applied"
  | "accepted"
  | "enrolled"
  | "rejected";

interface RecRow {
  id: string;
  engagement_id: string;
  school_id: string;
  school_name: string;
  rank: number | null;
  status: RecStatus;
  notes: string | null;
  engagement_task_id: string | null;
}

const REC_STATUS_OPTIONS: Array<{ value: RecStatus; label: string }> = [
  { value: "considered",  label: "Considered" },
  { value: "recommended", label: "Recommended" },
  { value: "applied",     label: "Applied" },
  { value: "accepted",    label: "Accepted" },
  { value: "enrolled",    label: "Enrolled" },
  { value: "rejected",    label: "Rejected" },
];

function SchoolRecommendationBody({
  taskId,
  engagementId,
}: {
  taskId: string;
  engagementId: string;
}) {
  const recs = useQuery<RecRow[], Error>({
    queryKey: ["engagements", engagementId, "recommendations"],
    queryFn: async () => {
      const res = await fetch(
        `/api/engagements/${engagementId}/recommendations`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error("Failed to load recommendations.");
      return res.json();
    },
  });
  const rec = recs.data?.find((r) => r.engagement_task_id === taskId) ?? null;
  if (recs.isPending) {
    return <Typography variant="body2" color="text.disabled">Loading…</Typography>;
  }
  if (!rec) {
    return (
      <Typography variant="body2" color="text.disabled">
        This activity isn't linked to a school recommendation row.
      </Typography>
    );
  }
  return <RecEditor rec={rec} />;
}

function RecEditor({ rec }: { rec: RecRow }) {
  const qc = useQueryClient();
  const snackbar = useSnackbar();
  const patch = useMutation({
    mutationFn: async (body: Partial<RecRow>) => {
      const res = await fetch(`/api/recommendations/${rec.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { detail?: string }).detail ?? "Update failed.");
      }
    },
    onSuccess: () =>
      qc.invalidateQueries({
        queryKey: ["engagements", rec.engagement_id, "recommendations"],
      }),
    onError: (e: Error) => snackbar.show(e.message, "error"),
  });
  return (
    <Stack spacing={1.5}>
      <Typography variant="caption" color="text.secondary">
        For <strong>{rec.school_name}</strong>
      </Typography>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
        <Box sx={{ flex: 1 }}>
          <FieldLabel>Status</FieldLabel>
          <Select
            size="small"
            fullWidth
            value={rec.status}
            onChange={(e) => patch.mutate({ status: e.target.value as RecStatus })}
          >
            {REC_STATUS_OPTIONS.map((o) => (
              <MenuItem key={o.value} value={o.value}>
                {o.label}
              </MenuItem>
            ))}
          </Select>
        </Box>
        <Box sx={{ flex: 1 }}>
          <FieldLabel>Rank</FieldLabel>
          <TextField
            size="small"
            fullWidth
            type="number"
            inputProps={{ min: 1 }}
            placeholder="(none)"
            defaultValue={rec.rank ?? ""}
            onBlur={(e) => {
              const next = e.target.value === "" ? null : Number(e.target.value);
              if (next !== rec.rank) patch.mutate({ rank: next });
            }}
          />
        </Box>
      </Stack>
      <Box>
        <FieldLabel>Notes</FieldLabel>
        <TextField
          size="small"
          fullWidth
          multiline
          minRows={2}
          placeholder="Why this school is on the list, application notes, follow-ups…"
          defaultValue={rec.notes ?? ""}
          onBlur={(e) => {
            const next = e.target.value.trim() || null;
            if (next !== rec.notes) patch.mutate({ notes: next });
          }}
        />
      </Box>
    </Stack>
  );
}

// ---- shared field label ---------------------------------------------------

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <Typography
      variant="caption"
      color="text.secondary"
      sx={{ display: "block", mb: 0.5, fontWeight: 600 }}
    >
      {children}
    </Typography>
  );
}

// ---- intake_summary --------------------------------------------------------

export type IntakeSummarySection =
  | "contacts"
  | "current_school"
  | "diagnoses"
  | "goals";

interface IntakeSummaryContact {
  person_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  is_primary_contact: boolean;
  is_billing_contact: boolean;
  mailing_address: string | null;
}

interface IntakeSummaryCurrentSchool {
  student_id: string;
  student_name: string;
  current_grade: string | null;
  current_school_id: string | null;
  current_school_name: string | null;
  current_school_city: string | null;
  current_school_state: string | null;
}

interface IntakeSummaryDiagnoses {
  student_id: string;
  student_name: string;
  has_504: boolean;
  has_iep: boolean;
  has_learning_disability: boolean;
  has_adhd: boolean;
  has_intellectual_disability: boolean;
  has_health_impairment: boolean;
  has_emotional_disturbance: boolean;
  autism_level: number | null;
  learning_disability_notes: string | null;
  intellectual_disability_notes: string | null;
  health_impairment_notes: string | null;
  emotional_disturbance_notes: string | null;
}

interface IntakeSummaryStudentDiscovery {
  working: string | null;
  not_working: string | null;
  history: string | null;
  school_fit: string | null;
  supports_tried: string | null;
}

interface IntakeSummaryGoals {
  desired_outcome: string | null;
  family_context_notes: string | null;
  constraints: string[];
  student_discovery: IntakeSummaryStudentDiscovery | null;
}

interface IntakeSummary {
  engagement_id: string;
  family_id: string | null;
  student_id: string | null;
  intake_id: string | null;
  contacts: IntakeSummaryContact[];
  current_school: IntakeSummaryCurrentSchool | null;
  diagnoses: IntakeSummaryDiagnoses | null;
  goals: IntakeSummaryGoals | null;
}

function IntakeSummaryBody({
  section,
  engagementId,
}: {
  section: IntakeSummarySection | null;
  engagementId: string;
}) {
  // One query per page; React Query dedupes the four rows onto a
  // single network round-trip via the shared queryKey.
  const summary = useQuery<IntakeSummary, Error>({
    queryKey: ["engagements", engagementId, "intake-summary"],
    queryFn: async () => {
      const res = await fetch(
        `/api/engagements/${engagementId}/intake-summary`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error("Failed to load intake summary.");
      return res.json();
    },
  });

  if (!section) {
    return (
      <Typography variant="body2" color="text.disabled">
        Section not configured on this activity. (Catalog admin can pick a
        section under Intake summary.)
      </Typography>
    );
  }
  if (summary.isPending) {
    return (
      <Typography variant="body2" color="text.disabled">
        Loading…
      </Typography>
    );
  }
  if (summary.isError) {
    return (
      <Typography variant="body2" color="error">
        {summary.error.message}
      </Typography>
    );
  }
  const data = summary.data;
  if (!data) return null;

  switch (section) {
    case "contacts":
      return <ContactsSection contacts={data.contacts} />;
    case "current_school":
      return <CurrentSchoolSection data={data.current_school} />;
    case "diagnoses":
      return <DiagnosesSection data={data.diagnoses} />;
    case "goals":
      return <GoalsSection data={data.goals} />;
  }
}

function ContactsSection({ contacts }: { contacts: IntakeSummaryContact[] }) {
  if (contacts.length === 0) {
    return (
      <Typography variant="body2" color="text.disabled">
        No guardians on file. Add them from the Guardians card above.
      </Typography>
    );
  }
  return (
    <Stack spacing={1.25}>
      {contacts.map((c) => (
        <Box key={c.person_id} sx={{ display: "flex", flexDirection: "column", gap: 0.25 }}>
          <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap">
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {c.name}
            </Typography>
            {c.role ? (
              <Typography variant="caption" color="text.secondary">
                · {c.role}
              </Typography>
            ) : null}
            {c.is_primary_contact ? (
              <Chip size="small" color="primary" label="Primary" sx={{ height: 18 }} />
            ) : null}
            {c.is_billing_contact ? (
              <Chip size="small" color="secondary" label="Billing" sx={{ height: 18 }} />
            ) : null}
          </Stack>
          <Stack direction="row" spacing={1.5} sx={{ flexWrap: "wrap" }}>
            {c.email ? (
              <Typography variant="caption" color="text.secondary">
                {c.email}
              </Typography>
            ) : null}
            {c.phone ? (
              <Typography variant="caption" color="text.secondary">
                {c.phone}
              </Typography>
            ) : null}
          </Stack>
          {c.mailing_address ? (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ whiteSpace: "pre-line" }}
            >
              {c.mailing_address}
            </Typography>
          ) : null}
        </Box>
      ))}
    </Stack>
  );
}

function CurrentSchoolSection({
  data,
}: {
  data: IntakeSummaryCurrentSchool | null;
}) {
  if (!data) {
    return (
      <Typography variant="body2" color="text.disabled">
        No student on this engagement.
      </Typography>
    );
  }
  if (!data.current_school_id) {
    return (
      <Stack spacing={0.5}>
        <Typography variant="body2">
          <strong>{data.student_name}</strong>
          {data.current_grade ? ` · grade ${data.current_grade}` : null}
        </Typography>
        <Typography variant="caption" color="text.disabled">
          No current school linked yet. Set it from the student page.
        </Typography>
      </Stack>
    );
  }
  return (
    <Stack spacing={0.5}>
      <Typography variant="body2">
        <strong>{data.student_name}</strong>
        {data.current_grade ? ` · grade ${data.current_grade}` : null}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {data.current_school_name}
        {(data.current_school_city || data.current_school_state) ? (
          <>
            {" · "}
            {[data.current_school_city, data.current_school_state]
              .filter(Boolean)
              .join(", ")}
          </>
        ) : null}
      </Typography>
    </Stack>
  );
}

const DIAGNOSIS_LABELS: Array<{
  key: keyof Pick<
    IntakeSummaryDiagnoses,
    | "has_504"
    | "has_iep"
    | "has_learning_disability"
    | "has_adhd"
    | "has_intellectual_disability"
    | "has_health_impairment"
    | "has_emotional_disturbance"
  >;
  label: string;
}> = [
  { key: "has_504",                    label: "504" },
  { key: "has_iep",                    label: "IEP" },
  { key: "has_learning_disability",    label: "Learning disability" },
  { key: "has_adhd",                   label: "ADHD" },
  { key: "has_intellectual_disability", label: "Intellectual disability" },
  { key: "has_health_impairment",      label: "Health impairment" },
  { key: "has_emotional_disturbance",  label: "Emotional disturbance" },
];

function DiagnosesSection({ data }: { data: IntakeSummaryDiagnoses | null }) {
  if (!data) {
    return (
      <Typography variant="body2" color="text.disabled">
        No student on this engagement.
      </Typography>
    );
  }
  const active = DIAGNOSIS_LABELS.filter((f) => data[f.key]);
  const autism =
    data.autism_level !== null ? `Autism (level ${data.autism_level})` : null;
  if (active.length === 0 && !autism) {
    return (
      <Typography variant="body2" color="text.disabled">
        No diagnostic flags recorded yet. Capture them from the student page.
      </Typography>
    );
  }
  const notes: Array<{ label: string; text: string }> = [];
  if (data.learning_disability_notes)
    notes.push({ label: "Learning disability", text: data.learning_disability_notes });
  if (data.intellectual_disability_notes)
    notes.push({ label: "Intellectual disability", text: data.intellectual_disability_notes });
  if (data.health_impairment_notes)
    notes.push({ label: "Health impairment", text: data.health_impairment_notes });
  if (data.emotional_disturbance_notes)
    notes.push({ label: "Emotional disturbance", text: data.emotional_disturbance_notes });

  return (
    <Stack spacing={1}>
      <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
        {active.map((f) => (
          <Chip key={f.key} size="small" label={f.label} variant="outlined" />
        ))}
        {autism ? (
          <Chip size="small" label={autism} color="primary" variant="outlined" />
        ) : null}
      </Stack>
      {notes.length > 0 ? (
        <Stack spacing={0.5}>
          {notes.map((n) => (
            <Typography key={n.label} variant="caption" color="text.secondary">
              <strong>{n.label}:</strong> {n.text}
            </Typography>
          ))}
        </Stack>
      ) : null}
    </Stack>
  );
}

function GoalsSection({ data }: { data: IntakeSummaryGoals | null }) {
  if (!data) {
    return (
      <Typography variant="body2" color="text.disabled">
        No intake linked to this engagement.
      </Typography>
    );
  }
  const disc = data.student_discovery;
  return (
    <Stack spacing={1.25}>
      <Box>
        <FieldLabel>Desired outcome</FieldLabel>
        <Typography
          variant="body2"
          color={data.desired_outcome ? "text.primary" : "text.disabled"}
          sx={{ whiteSpace: "pre-line" }}
        >
          {data.desired_outcome ?? "Not captured."}
        </Typography>
      </Box>
      {data.constraints.length > 0 ? (
        <Box>
          <FieldLabel>Constraints</FieldLabel>
          <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
            {data.constraints.map((c, idx) => (
              <Chip key={idx} size="small" label={c} variant="outlined" />
            ))}
          </Stack>
        </Box>
      ) : null}
      {data.family_context_notes ? (
        <Box>
          <FieldLabel>Family context</FieldLabel>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ whiteSpace: "pre-line" }}
          >
            {data.family_context_notes}
          </Typography>
        </Box>
      ) : null}
      {disc ? (
        <Stack spacing={0.75}>
          {disc.working ? (
            <Box>
              <FieldLabel>Working</FieldLabel>
              <Typography variant="body2" sx={{ whiteSpace: "pre-line" }}>
                {disc.working}
              </Typography>
            </Box>
          ) : null}
          {disc.not_working ? (
            <Box>
              <FieldLabel>Not working</FieldLabel>
              <Typography variant="body2" sx={{ whiteSpace: "pre-line" }}>
                {disc.not_working}
              </Typography>
            </Box>
          ) : null}
          {disc.history ? (
            <Box>
              <FieldLabel>History</FieldLabel>
              <Typography variant="body2" sx={{ whiteSpace: "pre-line" }}>
                {disc.history}
              </Typography>
            </Box>
          ) : null}
          {disc.school_fit ? (
            <Box>
              <FieldLabel>School fit</FieldLabel>
              <Typography variant="body2" sx={{ whiteSpace: "pre-line" }}>
                {disc.school_fit}
              </Typography>
            </Box>
          ) : null}
          {disc.supports_tried ? (
            <Box>
              <FieldLabel>Supports tried</FieldLabel>
              <Typography variant="body2" sx={{ whiteSpace: "pre-line" }}>
                {disc.supports_tried}
              </Typography>
            </Box>
          ) : null}
        </Stack>
      ) : null}
    </Stack>
  );
}

