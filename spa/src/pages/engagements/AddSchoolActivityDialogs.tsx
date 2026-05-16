import { useState } from "react";
import {
  Alert,
  Autocomplete,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useMutation, useQuery } from "@tanstack/react-query";

import { useSnackbar } from "../../components/Snackbar";

interface SchoolOption {
  id: string;
  name: string;
  location: string | null;
}

function useSchoolOptions() {
  return useQuery<SchoolOption[], Error>({
    queryKey: ["schools", "list"],
    queryFn: async () => {
      const res = await fetch("/api/schools", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load schools.");
      return res.json();
    },
  });
}

function SchoolPicker({
  value,
  onChange,
}: {
  value: SchoolOption | null;
  onChange: (s: SchoolOption | null) => void;
}) {
  const schools = useSchoolOptions();
  return (
    <Autocomplete<SchoolOption>
      size="small"
      options={schools.data ?? []}
      loading={schools.isPending}
      value={value}
      onChange={(_e, v) => onChange(v)}
      getOptionLabel={(s) => (s.location ? `${s.name} · ${s.location}` : s.name)}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      renderInput={(params) => (
        <TextField {...params} label="School" autoFocus />
      )}
    />
  );
}

export function AddSchoolVisitDialog({
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
  const [school, setSchool] = useState<SchoolOption | null>(null);
  const [visitDate, setVisitDate] = useState<string>(
    new Date().toISOString().slice(0, 10),
  );
  const [taskTitle, setTaskTitle] = useState("");

  const reset = () => {
    setSchool(null);
    setVisitDate(new Date().toISOString().slice(0, 10));
    setTaskTitle("");
  };

  const create = useMutation({
    mutationFn: async () => {
      if (!school) throw new Error("Pick a school first.");
      const res = await fetch(`/api/engagements/${engagementId}/visits`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          school_id: school.id,
          visit_date: visitDate || null,
          task_title: taskTitle.trim() || null,
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
      <DialogTitle>Add campus visit</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <SchoolPicker value={school} onChange={setSchool} />
          <TextField
            label="Visit date"
            type="date"
            size="small"
            value={visitDate}
            onChange={(e) => setVisitDate(e.target.value)}
          />
          <TextField
            label="Task title (optional)"
            placeholder='Defaults to "Campus visit — {school name}"'
            size="small"
            value={taskTitle}
            onChange={(e) => setTaskTitle(e.target.value)}
          />
          <Typography variant="caption" color="text.secondary">
            This creates both the school_visits row and an orchestrating activity
            in one shot. The activity appears in the list below.
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => { onClose(); reset(); }} disabled={create.isPending}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={() => create.mutate()}
          disabled={!school || create.isPending}
        >
          {create.isPending ? "Creating…" : "Create"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function AddSchoolRecommendationDialog({
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
  const [school, setSchool] = useState<SchoolOption | null>(null);
  const [rank, setRank] = useState<string>("");
  const [taskTitle, setTaskTitle] = useState("");
  const [duplicateError, setDuplicateError] = useState<string | null>(null);

  const reset = () => {
    setSchool(null);
    setRank("");
    setTaskTitle("");
    setDuplicateError(null);
  };

  const create = useMutation({
    mutationFn: async () => {
      if (!school) throw new Error("Pick a school first.");
      const res = await fetch(`/api/engagements/${engagementId}/recommendations`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          school_id: school.id,
          rank: rank ? Number(rank) : null,
          task_title: taskTitle.trim() || null,
        }),
      });
      if (res.status === 409) {
        const j = await res.json().catch(() => ({}));
        const msg = (j as { detail?: string }).detail
          ?? "A recommendation for this school already exists on this engagement.";
        setDuplicateError(msg);
        throw new Error(msg);
      }
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { detail?: string }).detail ?? "Create failed.");
      }
    },
    onSuccess: () => {
      reset();
      onCreated();
    },
    onError: (e: Error) => {
      if (!duplicateError) snackbar.show(e.message, "error");
    },
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
      <DialogTitle>Add school recommendation</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <SchoolPicker
            value={school}
            onChange={(s) => {
              setSchool(s);
              setDuplicateError(null);
            }}
          />
          <TextField
            label="Rank (optional)"
            type="number"
            inputProps={{ min: 1 }}
            placeholder="1, 2, 3…"
            size="small"
            value={rank}
            onChange={(e) => setRank(e.target.value)}
          />
          <TextField
            label="Task title (optional)"
            placeholder='Defaults to "Recommendation: {school name}"'
            size="small"
            value={taskTitle}
            onChange={(e) => setTaskTitle(e.target.value)}
          />
          {duplicateError && (
            <Alert severity="warning">{duplicateError}</Alert>
          )}
          <Typography variant="caption" color="text.secondary">
            Creates a school_recommendations row + orchestrating activity. Only
            one recommendation per school per engagement — edit the existing one
            instead of duplicating.
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => { onClose(); reset(); }} disabled={create.isPending}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={() => create.mutate()}
          disabled={!school || create.isPending}
        >
          {create.isPending ? "Creating…" : "Create"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
