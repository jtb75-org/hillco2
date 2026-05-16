import { useEffect, useState } from "react";
import {
  Autocomplete,
  Box,
  Chip,
  IconButton,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import CloseIcon from "@mui/icons-material/Close";
import { useQuery } from "@tanstack/react-query";

import { RichTextEditor } from "../../components/RichTextEditor";

import type { ActivityRow } from "./ActivitiesCard";

/** Which activity_kinds render an expanded body below the row.
 *  - task: no body (notes inline edit covers it)
 *  - school_visit / school_recommendation: body lives in card 4c
 *    where it'll wire to the external tables. Not in this card. */
export const KIND_HAS_BODY: Record<ActivityRow["activity_kind"], boolean> = {
  task: false,
  document_review: true,
  best_environment: true,
  feedback_meeting: true,
  school_visit: false,
  school_recommendation: false,
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
