import { useMemo, useState } from "react";
import {
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
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import CircleOutlinedIcon from "@mui/icons-material/CircleOutlined";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import PauseCircleOutlineIcon from "@mui/icons-material/PauseCircleOutline";
import PlayCircleOutlineIcon from "@mui/icons-material/PlayCircleOutline";
import RemoveCircleOutlineIcon from "@mui/icons-material/RemoveCircleOutline";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useSnackbar } from "../../components/Snackbar";
import {
  ActivityKindBody,
  KIND_HAS_BODY,
} from "./ActivityKindBodies";

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
  const [addOpen, setAddOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

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

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["engagements", engagementId, "tasks"] });

  const patchStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: TaskStatus }) => {
      const res = await fetch(`/api/tasks/${id}`, {
        method: "PATCH",
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
        <Button size="small" startIcon={<AddIcon />} onClick={() => setAddOpen(true)}>
          Add activity
        </Button>
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
        <Stack divider={<Box sx={{ borderTop: 1, borderColor: "divider" }} />}>
          {rows.map((row) => (
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
              onDescriptionCommit={(description) =>
                patchFields.mutate({
                  id: row.id,
                  body: { description } as Partial<ActivityRow>,
                })
              }
              onStructuredContentCommit={(structured_content) =>
                patchFields.mutate({
                  id: row.id,
                  body: { structured_content } as Partial<ActivityRow>,
                })
              }
              onDelete={() => remove.mutate(row.id)}
            />
          ))}
        </Stack>
      )}

      <AddActivityDialog
        open={addOpen}
        engagementId={engagementId}
        nextSortOrder={
          (rows[rows.length - 1]?.sort_order ?? 0) + 10
        }
        onClose={() => setAddOpen(false)}
        onCreated={() => {
          setAddOpen(false);
          invalidate();
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
  onDescriptionCommit,
  onStructuredContentCommit,
  onDelete,
}: {
  row: ActivityRow;
  engagementId: string;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onStatusChange: (next: TaskStatus) => void;
  onSkipToggle: () => void;
  onTitleCommit: (next: string) => void;
  onDescriptionCommit: (next: string | null) => void;
  onStructuredContentCommit: (next: Record<string, unknown>) => void;
  onDelete: () => void;
}) {
  const skipped = row.status === "not_applicable";
  const hasBody = KIND_HAS_BODY[row.activity_kind];
  return (
    <Box sx={{ py: 1.25, opacity: skipped ? 0.6 : 1 }}>
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
            <TitleInput
              value={row.title}
              strikethrough={skipped}
              onCommit={onTitleCommit}
            />
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
          <DescriptionInput
            value={row.description ?? ""}
            onCommit={(v) => onDescriptionCommit(v || null)}
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
        <RowMenu skipped={skipped} onSkipToggle={onSkipToggle} onDelete={onDelete} />
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

function DescriptionInput({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (v: string) => void;
}) {
  return (
    <DebouncedInput
      value={value}
      placeholder="Add notes…"
      multiline
      onCommit={onCommit}
      sx={{
        ".MuiInput-input": { fontSize: 13, color: "text.secondary" },
      }}
    />
  );
}

function DebouncedInput({
  value,
  placeholder,
  multiline,
  sx,
  onCommit,
}: {
  value: string;
  placeholder?: string;
  multiline?: boolean;
  sx?: object;
  onCommit: (v: string) => void;
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
      sx={sx}
    />
  );
}

function RowMenu({
  skipped,
  onSkipToggle,
  onDelete,
}: {
  skipped: boolean;
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
  const [description, setDescription] = useState("");
  const [billable, setBillable] = useState(true);

  const reset = () => {
    setTitle("");
    setDescription("");
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
          description: description.trim() || null,
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
