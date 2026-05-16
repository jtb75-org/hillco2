import { useEffect, useState } from "react";
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useSnackbar } from "../../components/Snackbar";

export type RequirementStatus = "needed" | "requested" | "received" | "waived";

export interface Requirement {
  id: string;
  engagement_id: string;
  kind: string;
  value: string | null;
  status: RequirementStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

const STATUS_OPTIONS: Array<{ value: RequirementStatus; label: string; color: "default" | "warning" | "info" | "success" }> = [
  { value: "needed",    label: "Needed",    color: "warning" },
  { value: "requested", label: "Requested", color: "info" },
  { value: "received",  label: "Received",  color: "success" },
  { value: "waived",    label: "Waived",    color: "default" },
];

const STATUS_INDEX: Record<RequirementStatus, number> = {
  needed: 0,
  requested: 1,
  received: 2,
  waived: 3,
};

export function RequirementsCard({ engagementId }: { engagementId: string }) {
  const qc = useQueryClient();
  const snackbar = useSnackbar();
  const [addOpen, setAddOpen] = useState(false);

  const requirements = useQuery<Requirement[], Error>({
    queryKey: ["engagements", engagementId, "requirements"],
    queryFn: async () => {
      const res = await fetch(`/api/engagements/${engagementId}/requirements`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load requirements.");
      return res.json();
    },
  });

  const patch = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Partial<Requirement> }) => {
      const res = await fetch(`/api/requirements/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { detail?: string }).detail ?? "Update failed.");
      }
      return res.json();
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["engagements", engagementId, "requirements"] }),
    onError: (e: Error) => snackbar.show(e.message, "error"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/requirements/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok && res.status !== 204) {
        throw new Error("Delete failed.");
      }
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["engagements", engagementId, "requirements"] }),
    onError: (e: Error) => snackbar.show(e.message, "error"),
  });

  const rows = sortByStatusThenKind(requirements.data ?? []);

  return (
    <Paper variant="outlined" sx={{ p: 2.5 }}>
      <Stack direction="row" alignItems="baseline" spacing={1} sx={{ mb: 1.5 }}>
        <Typography variant="overline" color="text.secondary" sx={{ flex: 1 }}>
          Requirements
        </Typography>
        <Button
          size="small"
          startIcon={<AddIcon />}
          onClick={() => setAddOpen(true)}
        >
          Add requirement
        </Button>
      </Stack>

      {rows.length === 0 ? (
        <Typography variant="body2" color="text.disabled">
          No requirements captured yet.
        </Typography>
      ) : (
        <Stack divider={<Box sx={{ borderTop: 1, borderColor: "divider" }} />}>
          {rows.map((r) => (
            <RequirementRow
              key={r.id}
              requirement={r}
              onStatusChange={(status) => patch.mutate({ id: r.id, body: { status } })}
              onNotesCommit={(notes) => patch.mutate({ id: r.id, body: { notes } })}
              onValueCommit={(value) => patch.mutate({ id: r.id, body: { value } })}
              onRemove={() => remove.mutate(r.id)}
            />
          ))}
        </Stack>
      )}

      <AddRequirementDialog
        open={addOpen}
        engagementId={engagementId}
        onClose={() => setAddOpen(false)}
        onCreated={() => {
          setAddOpen(false);
          qc.invalidateQueries({ queryKey: ["engagements", engagementId, "requirements"] });
        }}
      />
    </Paper>
  );
}

function sortByStatusThenKind(rows: Requirement[]): Requirement[] {
  // Group by status (active needs first, terminal states last), then
  // alphabetical by kind within a group.
  return [...rows].sort((a, b) => {
    const ds = STATUS_INDEX[a.status] - STATUS_INDEX[b.status];
    if (ds !== 0) return ds;
    return a.kind.localeCompare(b.kind);
  });
}

function RequirementRow({
  requirement,
  onStatusChange,
  onNotesCommit,
  onValueCommit,
  onRemove,
}: {
  requirement: Requirement;
  onStatusChange: (next: RequirementStatus) => void;
  onNotesCommit: (next: string | null) => void;
  onValueCommit: (next: string | null) => void;
  onRemove: () => void;
}) {
  return (
    <Stack
      direction={{ xs: "column", md: "row" }}
      spacing={1.5}
      alignItems={{ md: "flex-start" }}
      sx={{ py: 1.25 }}
    >
      <Box sx={{ width: { md: 140 }, flexShrink: 0, pt: 0.5 }}>
        <StatusSelect
          value={requirement.status}
          onChange={onStatusChange}
        />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
          {requirement.kind}
        </Typography>
        <DebouncedTextField
          fullWidth
          variant="standard"
          placeholder="Description (e.g. most recent 504 plan PDF)"
          value={requirement.value ?? ""}
          onCommit={(v) => onValueCommit(v || null)}
        />
        <DebouncedTextField
          fullWidth
          variant="standard"
          size="small"
          multiline
          placeholder="Notes (asked mom 5/8, in family folder, etc.)"
          value={requirement.notes ?? ""}
          onCommit={(v) => onNotesCommit(v || null)}
          sx={{ mt: 0.5, "& input, & textarea": { fontSize: 13, color: "text.secondary" } }}
        />
      </Box>
      <IconButton
        size="small"
        aria-label="Remove requirement"
        onClick={onRemove}
        sx={{ color: "text.disabled", "&:hover": { color: "error.main" } }}
      >
        <DeleteOutlineIcon fontSize="small" />
      </IconButton>
    </Stack>
  );
}

function StatusSelect({
  value,
  onChange,
}: {
  value: RequirementStatus;
  onChange: (next: RequirementStatus) => void;
}) {
  const current = STATUS_OPTIONS.find((o) => o.value === value) ?? STATUS_OPTIONS[0];
  return (
    <Select
      size="small"
      value={value}
      onChange={(e) => onChange(e.target.value as RequirementStatus)}
      renderValue={() => (
        <Chip
          size="small"
          color={current.color}
          label={current.label}
          variant={current.value === "waived" ? "outlined" : "filled"}
          sx={{ height: 22 }}
        />
      )}
      sx={{
        ".MuiSelect-select": { py: 0.5, pr: "32px !important" },
      }}
    >
      {STATUS_OPTIONS.map((o) => (
        <MenuItem key={o.value} value={o.value}>
          {o.label}
        </MenuItem>
      ))}
    </Select>
  );
}

function AddRequirementDialog({
  open,
  engagementId,
  onClose,
  onCreated,
}: {
  open: boolean;
  engagementId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const snackbar = useSnackbar();
  const [kind, setKind] = useState("");
  const [value, setValue] = useState("");

  const reset = () => {
    setKind("");
    setValue("");
  };

  const create = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/engagements/${engagementId}/requirements`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: kind.trim(),
          value: value.trim() || null,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { detail?: string }).detail ?? "Create failed.");
      }
      return res.json();
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
      <DialogTitle>Add requirement</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Kind"
            placeholder="504 plan, medical eval, transcript, etc."
            size="small"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            autoFocus
          />
          <TextField
            label="Description"
            placeholder="What specifically — e.g. most recent 504 plan PDF"
            size="small"
            multiline
            minRows={2}
            value={value}
            onChange={(e) => setValue(e.target.value)}
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
          disabled={!kind.trim() || create.isPending}
          onClick={() => create.mutate()}
        >
          {create.isPending ? "Adding…" : "Add"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** Local-state text input that commits on blur. */
function DebouncedTextField({
  value,
  onCommit,
  multiline,
  fullWidth,
  variant,
  size,
  placeholder,
  sx,
}: {
  value: string;
  onCommit: (v: string) => void;
  multiline?: boolean;
  fullWidth?: boolean;
  variant?: "standard" | "outlined" | "filled";
  size?: "small" | "medium";
  placeholder?: string;
  sx?: object;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => {
    setLocal(value);
  }, [value]);
  return (
    <TextField
      variant={variant}
      fullWidth={fullWidth}
      multiline={multiline}
      size={size}
      placeholder={placeholder}
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        if (local !== value) onCommit(local);
      }}
      sx={sx}
    />
  );
}
