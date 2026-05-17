import { useState } from "react";
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
  Paper,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import LockIcon from "@mui/icons-material/Lock";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useSnackbar } from "../../components/Snackbar";

interface TimeEntry {
  id: string;
  engagement_id: string;
  user_id: string;
  user_name: string | null;
  work_date: string;
  hours: string;
  description: string | null;
  billable: boolean;
  hourly_rate: string | null;
  invoice_id: string | null;
  invoice_number: string | null;
  engagement_task_id: string | null;
  task_title: string | null;
}

export function TimeEntriesCard({ engagementId }: { engagementId: string }) {
  const qc = useQueryClient();
  const snackbar = useSnackbar();
  const [addOpen, setAddOpen] = useState(false);

  const entries = useQuery<TimeEntry[], Error>({
    queryKey: ["engagements", engagementId, "time-entries"],
    queryFn: async () => {
      const res = await fetch(`/api/engagements/${engagementId}/time-entries`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load time entries.");
      return res.json();
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["engagements", engagementId, "time-entries"] });
    // Dashboard "uninvoiced" total is computed from time_entries.billable
    // sum — keep it in sync when any entry on this engagement changes.
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const patch = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Partial<TimeEntry> }) => {
      const res = await fetch(`/api/time-entries/${id}`, {
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
      const res = await fetch(`/api/time-entries/${id}`, {
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

  const rows = entries.data ?? [];
  const totalHours = rows.reduce((acc, r) => acc + Number(r.hours || 0), 0);
  const billableHours = rows
    .filter((r) => r.billable)
    .reduce((acc, r) => acc + Number(r.hours || 0), 0);

  return (
    <Paper variant="outlined" sx={{ p: 2.5 }}>
      <Stack direction="row" alignItems="baseline" spacing={1} sx={{ mb: 1.5 }}>
        <Typography variant="overline" color="text.secondary" sx={{ flex: 1 }}>
          Time entries
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {totalHours.toFixed(2)}h total · {billableHours.toFixed(2)}h billable
        </Typography>
        <Button size="small" startIcon={<AddIcon />} onClick={() => setAddOpen(true)}>
          Log time
        </Button>
      </Stack>

      {entries.isPending ? (
        <Typography variant="body2" color="text.disabled">Loading…</Typography>
      ) : rows.length === 0 ? (
        <Typography variant="body2" color="text.disabled">
          No time logged yet.
        </Typography>
      ) : (
        <Stack divider={<Box sx={{ borderTop: 1, borderColor: "divider" }} />}>
          {rows.map((r) => (
            <TimeEntryRow
              key={r.id}
              entry={r}
              onPatch={(body) => patch.mutate({ id: r.id, body })}
              onDelete={() => remove.mutate(r.id)}
            />
          ))}
        </Stack>
      )}

      <AddTimeEntryDialog
        open={addOpen}
        engagementId={engagementId}
        onClose={() => setAddOpen(false)}
        onCreated={() => {
          setAddOpen(false);
          invalidate();
        }}
      />
    </Paper>
  );
}

function TimeEntryRow({
  entry,
  onPatch,
  onDelete,
}: {
  entry: TimeEntry;
  onPatch: (body: Partial<TimeEntry>) => void;
  onDelete: () => void;
}) {
  const locked = entry.invoice_id !== null;
  return (
    <Stack
      direction={{ xs: "column", md: "row" }}
      spacing={1.5}
      alignItems={{ md: "center" }}
      sx={{
        py: 1.25,
        opacity: locked ? 0.7 : 1,
      }}
    >
      <Box sx={{ width: { md: 130 }, flexShrink: 0 }}>
        <TextField
          size="small"
          fullWidth
          type="date"
          disabled={locked}
          defaultValue={entry.work_date}
          onBlur={(e) => {
            if (e.target.value !== entry.work_date) {
              onPatch({ work_date: e.target.value || null } as Partial<TimeEntry>);
            }
          }}
        />
      </Box>
      <Box sx={{ width: { md: 80 }, flexShrink: 0 }}>
        <TextField
          size="small"
          fullWidth
          type="number"
          inputProps={{ step: "0.25", min: "0.01" }}
          disabled={locked}
          defaultValue={entry.hours}
          onBlur={(e) => {
            if (e.target.value !== entry.hours) {
              onPatch({ hours: e.target.value } as Partial<TimeEntry>);
            }
          }}
        />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <TextField
          size="small"
          fullWidth
          placeholder="What did you do?"
          disabled={locked}
          defaultValue={entry.description ?? ""}
          onBlur={(e) => {
            const next = e.target.value.trim() || null;
            if (next !== entry.description) {
              onPatch({ description: next } as Partial<TimeEntry>);
            }
          }}
        />
        {entry.task_title && (
          <Chip
            size="small"
            variant="outlined"
            label={entry.task_title}
            sx={{ mt: 0.5, height: 20, fontSize: 11 }}
          />
        )}
      </Box>
      <Stack direction="row" spacing={0.5} alignItems="center">
        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={entry.billable}
              disabled={locked}
              onChange={(e) =>
                onPatch({ billable: e.target.checked } as Partial<TimeEntry>)
              }
            />
          }
          label={
            <Typography variant="caption" color="text.secondary">
              Billable
            </Typography>
          }
          sx={{ mr: 0 }}
        />
        {locked && (
          <Tooltip title={`On invoice ${entry.invoice_number ?? entry.invoice_id}`}>
            <Chip
              size="small"
              icon={<LockIcon fontSize="small" />}
              label={entry.invoice_number ?? "invoiced"}
              variant="outlined"
            />
          </Tooltip>
        )}
        {!locked && (
          <IconButton
            size="small"
            aria-label="Delete time entry"
            onClick={onDelete}
            sx={{ color: "text.disabled", "&:hover": { color: "error.main" } }}
          >
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        )}
      </Stack>
    </Stack>
  );
}

function AddTimeEntryDialog({
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
  const [workDate, setWorkDate] = useState<string>(
    new Date().toISOString().slice(0, 10),
  );
  const [hours, setHours] = useState("");
  const [description, setDescription] = useState("");
  const [billable, setBillable] = useState(true);

  const reset = () => {
    setWorkDate(new Date().toISOString().slice(0, 10));
    setHours("");
    setDescription("");
    setBillable(true);
  };

  const create = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/engagements/${engagementId}/time-entries`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          work_date: workDate || null,
          hours,
          description: description.trim() || null,
          billable,
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
      <DialogTitle>Log time</DialogTitle>
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
            placeholder="What did you do?"
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
          disabled={!hours || Number(hours) <= 0 || create.isPending}
        >
          {create.isPending ? "Logging…" : "Log"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
