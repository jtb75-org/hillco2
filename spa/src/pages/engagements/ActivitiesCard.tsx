import { useEffect, useMemo, useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  Menu,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import CircleOutlinedIcon from "@mui/icons-material/CircleOutlined";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import PauseCircleOutlineIcon from "@mui/icons-material/PauseCircleOutline";
import PlayCircleOutlineIcon from "@mui/icons-material/PlayCircleOutline";
import RemoveCircleOutlineIcon from "@mui/icons-material/RemoveCircleOutline";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { RichTextEditor } from "../../components/RichTextEditor";
import { useSnackbar } from "../../components/Snackbar";
import {
  ActivityKindBody,
  KIND_HAS_BODY,
} from "./ActivityKindBodies";
import { AddSchoolVisitDialog, AddSchoolRecommendationDialog } from "./AddSchoolActivityDialogs";

type TaskStatus =
  | "not_started"
  | "in_progress"
  | "completed"
  | "blocked"
  | "not_applicable";

type ActivityKind =
  | "task"
  | "document_review"
  | "best_environment"
  | "feedback_meeting"
  | "school_visit"
  | "school_recommendation";

export interface ActivityRow {
  id: string;
  engagement_id: string;
  title: string;
  description: string | null;
  notes: string | null;
  status: TaskStatus;
  billable: boolean;
  est_hours: string | null;
  actual_hours: string | null;
  sort_order: number;
  activity_kind: ActivityKind;
  structured_content: Record<string, unknown>;
  service_item_id: string | null;
  phase_id: string | null;
}

interface CatalogPhase {
  id: string;
  sort_order: number;
  title: string;
}

// "Other / bespoke" bucket for rows with no phase_id. Sorted last.
const BESPOKE_PHASE_KEY = "__bespoke__";

interface PhaseGroup {
  key: string;
  title: string;
  rows: ActivityRow[];
}

const STATUS_OPTIONS: Array<{ value: TaskStatus; label: string; icon: React.ReactNode; tone: "default" | "info" | "success" | "warning" }> = [
  { value: "not_started",    label: "Not started", icon: <CircleOutlinedIcon fontSize="small" />,       tone: "default" },
  { value: "in_progress",    label: "In progress", icon: <PlayCircleOutlineIcon fontSize="small" />,    tone: "info" },
  { value: "completed",      label: "Completed",   icon: <CheckCircleOutlineIcon fontSize="small" />,   tone: "success" },
  { value: "blocked",        label: "Blocked",     icon: <PauseCircleOutlineIcon fontSize="small" />,   tone: "warning" },
  { value: "not_applicable", label: "Skipped",     icon: <RemoveCircleOutlineIcon fontSize="small" />,  tone: "default" },
];

const KIND_LABEL: Record<ActivityKind, string> = {
  task: "Task",
  document_review: "Document review",
  best_environment: "Best environment",
  feedback_meeting: "Feedback meeting",
  school_visit: "Campus visit",
  school_recommendation: "Recommendation",
};

export function ActivitiesCard({ engagementId }: { engagementId: string }) {
  const qc = useQueryClient();
  const snackbar = useSnackbar();
  const [showSkipped, setShowSkipped] = useState(false);
  const [addOpen, setAddOpen] = useState<"task" | "visit" | "recommendation" | null>(null);
  const [addMenuAnchor, setAddMenuAnchor] = useState<HTMLElement | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [logTimeFor, setLogTimeFor] = useState<ActivityRow | null>(null);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const tasks = useQuery<ActivityRow[], Error>({
    queryKey: ["engagements", engagementId, "tasks", { showSkipped }],
    queryFn: async () => {
      const url = new URL(
        `/api/engagements/${engagementId}/tasks`,
        window.location.origin,
      );
      if (showSkipped) url.searchParams.set("include_skipped", "true");
      const res = await fetch(url.toString().replace(window.location.origin, ""), {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load activities.");
      return res.json();
    },
  });

  const catalog = useQuery<CatalogPhase[], Error>({
    queryKey: ["engagements", engagementId, "catalog"],
    queryFn: async () => {
      const res = await fetch(`/api/engagements/${engagementId}/catalog`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load catalog.");
      return res.json();
    },
  });

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["engagements", engagementId, "tasks"] });

  const patchStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: TaskStatus }) => {
      const res = await fetch(`/api/tasks/${id}/status`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { detail?: string }).detail ?? "Status update failed.");
      }
    },
    onSuccess: invalidate,
    onError: (e: Error) => snackbar.show(e.message, "error"),
  });

  const patchFields = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Partial<ActivityRow> }) => {
      const res = await fetch(`/api/tasks/${id}`, {
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
    onSuccess: invalidate,
    onError: (e: Error) => snackbar.show(e.message, "error"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/tasks/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok && res.status !== 204) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { detail?: string }).detail ?? "Delete failed.");
      }
    },
    onSuccess: invalidate,
    onError: (e: Error) => snackbar.show(e.message, "error"),
  });

  const rows = useMemo(() => {
    const list = tasks.data ?? [];
    return [...list].sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));
  }, [tasks.data]);

  const counts = useMemo(() => {
    const list = tasks.data ?? [];
    const total = list.length;
    const done = list.filter((t) => t.status === "completed").length;
    const skipped = list.filter((t) => t.status === "not_applicable").length;
    const eff = Math.max(total - skipped, 0);
    return { total, done, skipped, eff };
  }, [tasks.data]);

  // Group rows by phase. The catalog gives us phase titles + their
  // sort order; bespoke rows (no phase_id, or phase_id pointing at a
  // phase not in this engagement type's catalog) fall into a trailing
  // "Other" bucket.
  const phaseGroups = useMemo<PhaseGroup[]>(() => {
    const phaseById = new Map<string, CatalogPhase>(
      (catalog.data ?? []).map((p) => [p.id, p]),
    );
    const byKey = new Map<string, ActivityRow[]>();
    for (const r of rows) {
      const key = r.phase_id && phaseById.has(r.phase_id) ? r.phase_id : BESPOKE_PHASE_KEY;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key)!.push(r);
    }
    const out: PhaseGroup[] = [];
    for (const p of catalog.data ?? []) {
      const rs = byKey.get(p.id);
      if (rs && rs.length > 0) {
        out.push({ key: p.id, title: p.title, rows: rs });
      }
    }
    const bespoke = byKey.get(BESPOKE_PHASE_KEY);
    if (bespoke && bespoke.length > 0) {
      out.push({ key: BESPOKE_PHASE_KEY, title: "Other", rows: bespoke });
    }
    return out;
  }, [rows, catalog.data]);

  // Phase accordion state — auto-expand the first phase that still
  // has open work; collapse fully-done phases. User toggles override
  // and persist for the lifetime of this view.
  const [phaseExpanded, setPhaseExpanded] = useState<Set<string>>(new Set());
  const [phaseDefaultsApplied, setPhaseDefaultsApplied] = useState(false);
  useEffect(() => {
    if (phaseDefaultsApplied || phaseGroups.length === 0) return;
    const initial = new Set<string>();
    let firstActiveFound = false;
    for (const g of phaseGroups) {
      const hasActive = g.rows.some(
        (r) => r.status !== "completed" && r.status !== "not_applicable",
      );
      if (hasActive && !firstActiveFound) {
        initial.add(g.key);
        firstActiveFound = true;
      }
    }
    // If every phase is done, expand the last one so the operator sees
    // something rather than a wall of collapsed accordions.
    if (initial.size === 0) {
      initial.add(phaseGroups[phaseGroups.length - 1].key);
    }
    setPhaseExpanded(initial);
    setPhaseDefaultsApplied(true);
  }, [phaseGroups, phaseDefaultsApplied]);

  const togglePhase = (key: string) => {
    setPhaseExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <Paper variant="outlined" sx={{ p: 2.5 }}>
      <Stack
        direction="row"
        alignItems="baseline"
        spacing={1}
        sx={{ mb: 1.5, flexWrap: "wrap" }}
      >
        <Typography variant="overline" color="text.secondary" sx={{ flex: 1 }}>
          Activities
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {counts.done} / {counts.eff} complete
          {counts.skipped > 0 ? ` · ${counts.skipped} skipped` : ""}
        </Typography>
        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={showSkipped}
              onChange={(e) => setShowSkipped(e.target.checked)}
            />
          }
          label={
            <Typography variant="caption" color="text.secondary">
              Show skipped
            </Typography>
          }
          sx={{ ml: 1 }}
        />
        <Button
          size="small"
          startIcon={<AddIcon />}
          endIcon={<ArrowDropDownIcon />}
          onClick={(e) => setAddMenuAnchor(e.currentTarget)}
        >
          Add activity
        </Button>
        <Menu
          anchorEl={addMenuAnchor}
          open={!!addMenuAnchor}
          onClose={() => setAddMenuAnchor(null)}
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
          transformOrigin={{ vertical: "top", horizontal: "right" }}
        >
          <MenuItem
            onClick={() => {
              setAddMenuAnchor(null);
              setAddOpen("task");
            }}
          >
            Bespoke task
          </MenuItem>
          <MenuItem
            onClick={() => {
              setAddMenuAnchor(null);
              setAddOpen("visit");
            }}
          >
            Campus visit
          </MenuItem>
          <MenuItem
            onClick={() => {
              setAddMenuAnchor(null);
              setAddOpen("recommendation");
            }}
          >
            School recommendation
          </MenuItem>
        </Menu>
      </Stack>

      {tasks.isPending ? (
        <Typography variant="body2" color="text.disabled">
          Loading…
        </Typography>
      ) : rows.length === 0 ? (
        <Typography variant="body2" color="text.disabled">
          No activities yet. Use Add activity to start a bespoke item.
        </Typography>
      ) : (
        <Stack spacing={0.75}>
          {phaseGroups.map((group) => {
            const done = group.rows.filter((r) => r.status === "completed").length;
            const skipped = group.rows.filter((r) => r.status === "not_applicable").length;
            const effective = Math.max(group.rows.length - skipped, 0);
            const allDone = effective > 0 && done === effective;
            return (
              <Accordion
                key={group.key}
                expanded={phaseExpanded.has(group.key)}
                onChange={() => togglePhase(group.key)}
                variant="outlined"
                disableGutters
                sx={{
                  "&:before": { display: "none" },
                  borderRadius: 1,
                }}
              >
                <AccordionSummary
                  expandIcon={<ExpandMoreIcon />}
                  data-testid={`phase-summary-${group.title.toLowerCase().replace(/\s+/g, "-")}`}
                  sx={{
                    "& .MuiAccordionSummary-content": {
                      my: 0.5,
                      alignItems: "center",
                      gap: 1,
                    },
                  }}
                >
                  {allDone && (
                    <CheckCircleOutlineIcon
                      fontSize="small"
                      sx={{ color: "success.main" }}
                    />
                  )}
                  <Typography variant="subtitle2" sx={{ fontWeight: 600, flex: 1 }}>
                    {group.title}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {done} / {effective} complete
                    {skipped > 0 ? ` · ${skipped} skipped` : ""}
                  </Typography>
                </AccordionSummary>
                <AccordionDetails sx={{ px: 2, py: 0.5 }}>
                  <Stack divider={<Box sx={{ borderTop: 1, borderColor: "divider" }} />}>
                    {group.rows.map((row) => (
                      <ActivityRowView
                        key={row.id}
                        row={row}
                        engagementId={engagementId}
                        isExpanded={expanded.has(row.id)}
                        onToggleExpand={() => toggleExpand(row.id)}
                        onStatusChange={(status) => patchStatus.mutate({ id: row.id, status })}
                        onSkipToggle={() => {
                          const next: TaskStatus =
                            row.status === "not_applicable" ? "not_started" : "not_applicable";
                          patchStatus.mutate({ id: row.id, status: next });
                        }}
                        onTitleCommit={(title) =>
                          patchFields.mutate({ id: row.id, body: { title } as Partial<ActivityRow> })
                        }
                        onNotesCommit={(notes) =>
                          patchFields.mutate({
                            id: row.id,
                            body: { notes } as Partial<ActivityRow>,
                          })
                        }
                        onStructuredContentCommit={(structured_content) =>
                          patchFields.mutate({
                            id: row.id,
                            body: { structured_content } as Partial<ActivityRow>,
                          })
                        }
                        onLogTime={() => setLogTimeFor(row)}
                        onDelete={() => remove.mutate(row.id)}
                      />
                    ))}
                  </Stack>
                </AccordionDetails>
              </Accordion>
            );
          })}
        </Stack>
      )}

      <AddActivityDialog
        open={addOpen === "task"}
        engagementId={engagementId}
        nextSortOrder={
          (rows[rows.length - 1]?.sort_order ?? 0) + 10
        }
        onClose={() => setAddOpen(null)}
        onCreated={() => {
          setAddOpen(null);
          invalidate();
        }}
      />
      <AddSchoolVisitDialog
        open={addOpen === "visit"}
        engagementId={engagementId}
        onClose={() => setAddOpen(null)}
        onCreated={() => {
          setAddOpen(null);
          invalidate();
        }}
      />
      <AddSchoolRecommendationDialog
        open={addOpen === "recommendation"}
        engagementId={engagementId}
        onClose={() => setAddOpen(null)}
        onCreated={() => {
          setAddOpen(null);
          invalidate();
        }}
      />

      <LogTimeForTaskDialog
        engagementId={engagementId}
        activity={logTimeFor}
        phaseTitle={
          logTimeFor
            ? catalog.data?.find((p) => p.id === logTimeFor.phase_id)?.title ?? null
            : null
        }
        onClose={() => setLogTimeFor(null)}
        onLogged={() => {
          setLogTimeFor(null);
          // The Time Entries card watches its own query; invalidate so
          // the new entry shows up there immediately.
          qc.invalidateQueries({
            queryKey: ["engagements", engagementId, "time-entries"],
          });
        }}
      />
    </Paper>
  );
}

function ActivityRowView({
  row,
  engagementId,
  isExpanded,
  onToggleExpand,
  onStatusChange,
  onSkipToggle,
  onTitleCommit,
  onNotesCommit,
  onStructuredContentCommit,
  onLogTime,
  onDelete,
}: {
  row: ActivityRow;
  engagementId: string;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onStatusChange: (next: TaskStatus) => void;
  onSkipToggle: () => void;
  onTitleCommit: (next: string) => void;
  onNotesCommit: (next: string | null) => void;
  onStructuredContentCommit: (next: Record<string, unknown>) => void;
  onLogTime: () => void;
  onDelete: () => void;
}) {
  const skipped = row.status === "not_applicable";
  const hasBody = KIND_HAS_BODY[row.activity_kind];
  // Catalog-seeded rows (service_item_id IS NOT NULL) keep their
  // title locked — the wording belongs to the catalog. Bespoke rows
  // are the operator's, so they can be retitled freely.
  const titleLocked = row.service_item_id !== null;
  return (
    <Box
      data-testid={`activity-row-${row.id}`}
      data-activity-title={row.title}
      sx={{ py: 1.25, opacity: skipped ? 0.6 : 1 }}
    >
      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={1.5}
        alignItems={{ md: "flex-start" }}
      >
        <Box sx={{ width: { md: 160 }, flexShrink: 0, pt: 0.5 }}>
          <StatusSelect value={row.status} onChange={onStatusChange} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.25 }}>
            {titleLocked ? (
              <Typography
                variant="body2"
                sx={{
                  flex: 1,
                  fontWeight: 500,
                  textDecoration: skipped ? "line-through" : "none",
                }}
              >
                {row.title}
              </Typography>
            ) : (
              <TitleInput
                value={row.title}
                strikethrough={skipped}
                onCommit={onTitleCommit}
              />
            )}
            {row.activity_kind !== "task" && (
              <Chip
                size="small"
                variant="outlined"
                label={KIND_LABEL[row.activity_kind]}
                sx={{ height: 20, fontSize: 11 }}
              />
            )}
            {row.billable && (
              <Chip
                size="small"
                variant="outlined"
                label="billable"
                sx={{ height: 20, fontSize: 11 }}
              />
            )}
          </Stack>
          <NotesInput
            value={row.notes ?? ""}
            onCommit={(v) => onNotesCommit(v || null)}
          />
        </Box>
        {hasBody && (
          <IconButton
            size="small"
            aria-label={isExpanded ? "Collapse activity" : "Expand activity"}
            onClick={onToggleExpand}
            sx={{
              color: "text.disabled",
              transform: isExpanded ? "rotate(180deg)" : "none",
              transition: (t) => t.transitions.create("transform"),
            }}
          >
            <ExpandMoreIcon fontSize="small" />
          </IconButton>
        )}
        <RowMenu
          skipped={skipped}
          onLogTime={onLogTime}
          onSkipToggle={onSkipToggle}
          onDelete={onDelete}
        />
      </Stack>
      {hasBody && isExpanded && (
        <Box sx={{ mt: 1.5, ml: { md: "172px" } }}>
          <ActivityKindBody
            row={row}
            engagementId={engagementId}
            onCommit={onStructuredContentCommit}
          />
        </Box>
      )}
    </Box>
  );
}

function StatusSelect({
  value,
  onChange,
}: {
  value: TaskStatus;
  onChange: (next: TaskStatus) => void;
}) {
  const current = STATUS_OPTIONS.find((o) => o.value === value) ?? STATUS_OPTIONS[0];
  return (
    <Select
      size="small"
      value={value}
      inputProps={{ "aria-label": "Activity status" }}
      onChange={(e) => onChange(e.target.value as TaskStatus)}
      renderValue={() => (
        <Stack direction="row" spacing={0.75} alignItems="center">
          {current.icon}
          <Typography variant="body2">{current.label}</Typography>
        </Stack>
      )}
      sx={{
        width: "100%",
        ".MuiSelect-select": { py: 0.5, pr: "32px !important" },
      }}
    >
      {STATUS_OPTIONS.map((o) => (
        <MenuItem key={o.value} value={o.value}>
          <Stack direction="row" spacing={1} alignItems="center">
            {o.icon}
            <span>{o.label}</span>
          </Stack>
        </MenuItem>
      ))}
    </Select>
  );
}

function TitleInput({
  value,
  strikethrough,
  onCommit,
}: {
  value: string;
  strikethrough: boolean;
  onCommit: (v: string) => void;
}) {
  return (
    <DebouncedInput
      value={value}
      onCommit={(v) => {
        if (v.trim()) onCommit(v.trim());
      }}
      sx={{
        flex: 1,
        ".MuiInput-input": {
          fontWeight: 500,
          textDecoration: strikethrough ? "line-through" : "none",
        },
      }}
    />
  );
}

function NotesInput({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (v: string) => void;
}) {
  // Click-to-edit. Read mode is a small div rendering the notes as
  // HTML (or showing a placeholder); edit mode lazy-mounts Tiptap with
  // the B / I / list toolbar. Only ONE editor is alive at a time across
  // the whole activities list — no perf hit when the page loads with
  // 19-28 activities.
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [editing, value]);

  if (!editing) {
    const empty = !value || value === "<p></p>";
    const commonSx = {
      minHeight: 32,
      py: 0.5,
      fontSize: 13,
      cursor: "text",
      "& p": { m: 0, mb: 0.5 },
      "& p:last-child": { mb: 0 },
      "& ul, & ol": { my: 0.5, pl: 3 },
    };
    // Intentionally not role="button" / tabIndex — those create dozens
    // of phantom button-role nodes per page that slow down Playwright's
    // getByRole queries and confuse keyboard nav. Click is the
    // expected interaction; the editor itself takes care of focus
    // once mounted.
    const handlers = {
      onClick: () => setEditing(true),
    };
    if (empty) {
      return (
        <Box
          {...handlers}
          sx={{
            ...commonSx,
            color: "text.disabled",
            fontStyle: "italic",
            "&:hover": { color: "text.secondary" },
          }}
        >
          Add notes…
        </Box>
      );
    }
    return (
      <Box
        {...handlers}
        sx={{
          ...commonSx,
          color: "text.secondary",
          "&:hover": { color: "text.primary" },
        }}
        dangerouslySetInnerHTML={{ __html: value }}
      />
    );
  }
  return (
    <Box
      sx={{
        display: "flex",
        "& .rich-text-editor-body": {
          minHeight: "3em",
          fontSize: 13,
          color: "text.secondary",
        },
      }}
      onBlur={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        if (draft !== value) onCommit(draft);
        setEditing(false);
      }}
    >
      <RichTextEditor
        value={draft}
        onChange={setDraft}
        placeholder="Add notes…"
        minRows={2}
        autoFocus
      />
    </Box>
  );
}

function DebouncedInput({
  value,
  placeholder,
  multiline,
  sx,
  onCommit,
  onFocus,
}: {
  value: string;
  placeholder?: string;
  multiline?: boolean;
  sx?: object;
  onCommit: (v: string) => void;
  onFocus?: () => void;
}) {
  const [local, setLocal] = useState(value);
  // Re-sync from parent on refetch — see RequirementsCard/IntakeForm
  // for the same pattern.
  useMemo(() => setLocal(value), [value]);
  return (
    <TextField
      variant="standard"
      fullWidth
      placeholder={placeholder}
      multiline={multiline}
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        if (local !== value) onCommit(local);
      }}
      onFocus={onFocus}
      sx={sx}
    />
  );
}

function RowMenu({
  skipped,
  onLogTime,
  onSkipToggle,
  onDelete,
}: {
  skipped: boolean;
  onLogTime: () => void;
  onSkipToggle: () => void;
  onDelete: () => void;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <>
      <IconButton
        size="small"
        aria-label="Row actions"
        onClick={(e) => setAnchor(e.currentTarget)}
        sx={{ color: "text.disabled" }}
      >
        <MoreVertIcon fontSize="small" />
      </IconButton>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
        <MenuItem
          onClick={() => {
            setAnchor(null);
            onLogTime();
          }}
        >
          Log time
        </MenuItem>
        <MenuItem
          onClick={() => {
            setAnchor(null);
            onSkipToggle();
          }}
        >
          {skipped ? "Restore" : "Skip"}
        </MenuItem>
        <MenuItem
          onClick={() => {
            setAnchor(null);
            onDelete();
          }}
          sx={{ color: "error.main" }}
        >
          Delete
        </MenuItem>
      </Menu>
    </>
  );
}

function AddActivityDialog({
  open,
  engagementId,
  nextSortOrder,
  onClose,
  onCreated,
}: {
  open: boolean;
  engagementId: string;
  nextSortOrder: number;
  onClose: () => void;
  onCreated: () => void;
}) {
  const snackbar = useSnackbar();
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [billable, setBillable] = useState(true);

  const reset = () => {
    setTitle("");
    setNotes("");
    setBillable(true);
  };

  const create = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/engagements/${engagementId}/tasks`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          notes: notes.trim() || null,
          billable,
          sort_order: nextSortOrder,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { detail?: string }).detail ?? "Create failed.");
      }
    },
    onSuccess: () => {
      reset();
      onCreated();
    },
    onError: (e: Error) => snackbar.show(e.message, "error"),
  });

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (create.isPending) return;
        onClose();
        reset();
      }}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle>Add activity</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Title"
            size="small"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />
          <TextField
            label="Notes"
            size="small"
            multiline
            minRows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <FormControlLabel
            control={
              <Switch
                checked={billable}
                onChange={(e) => setBillable(e.target.checked)}
                size="small"
              />
            }
            label="Billable"
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button
          onClick={() => {
            onClose();
            reset();
          }}
          disabled={create.isPending}
        >
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={() => create.mutate()}
          disabled={!title.trim() || create.isPending}
        >
          {create.isPending ? "Adding…" : "Add"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function LogTimeForTaskDialog({
  engagementId,
  activity,
  phaseTitle,
  onClose,
  onLogged,
}: {
  engagementId: string;
  activity: ActivityRow | null;
  phaseTitle: string | null;
  onClose: () => void;
  onLogged: () => void;
}) {
  const snackbar = useSnackbar();
  const [workDate, setWorkDate] = useState<string>(
    new Date().toISOString().slice(0, 10),
  );
  const [hours, setHours] = useState("");
  const [description, setDescription] = useState("");
  const [billable, setBillable] = useState(true);

  // Re-seed local state every time a new activity is opened so a
  // previously-dismissed dialog's drafts don't carry over.
  const seedKey = activity?.id ?? "";
  const [lastSeed, setLastSeed] = useState<string>("");
  if (activity && lastSeed !== seedKey) {
    setWorkDate(new Date().toISOString().slice(0, 10));
    setHours("");
    // Default description: "Phase Name: Activity Name" so the time
    // entry is self-explanatory in the rollup even before the operator
    // adds detail. They can still edit / blank it out.
    setDescription(
      phaseTitle ? `${phaseTitle}: ${activity.title}` : activity.title,
    );
    setBillable(activity.billable);
    setLastSeed(seedKey);
  }

  const create = useMutation({
    mutationFn: async () => {
      if (!activity) return;
      const res = await fetch(`/api/engagements/${engagementId}/time-entries`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          work_date: workDate || null,
          hours,
          description: description.trim() || null,
          billable,
          engagement_task_id: activity.id,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { detail?: string }).detail ?? "Log failed.");
      }
    },
    onSuccess: () => {
      setHours("");
      setDescription("");
      onLogged();
    },
    onError: (e: Error) => snackbar.show(e.message, "error"),
  });

  return (
    <Dialog
      open={activity !== null}
      onClose={() => !create.isPending && onClose()}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle>
        Log time
        {activity && (
          <Typography
            component="span"
            variant="caption"
            color="text.secondary"
            sx={{ ml: 1 }}
          >
            on “{activity.title}”
          </Typography>
        )}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
            <TextField
              label="Date"
              type="date"
              size="small"
              value={workDate}
              onChange={(e) => setWorkDate(e.target.value)}
              sx={{ flex: 1 }}
            />
            <TextField
              label="Hours"
              type="number"
              inputProps={{ step: "0.25", min: "0.01" }}
              size="small"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              autoFocus
              sx={{ flex: 1 }}
            />
          </Stack>
          <TextField
            label="Description"
            placeholder="What did you do on this task?"
            size="small"
            multiline
            minRows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <FormControlLabel
            control={
              <Switch
                checked={billable}
                onChange={(e) => setBillable(e.target.checked)}
                size="small"
              />
            }
            label="Billable"
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={create.isPending}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={() => create.mutate()}
          disabled={!hours || Number(hours) <= 0 || create.isPending}
        >
          {create.isPending ? "Logging…" : "Log"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
