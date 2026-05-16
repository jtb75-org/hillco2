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

