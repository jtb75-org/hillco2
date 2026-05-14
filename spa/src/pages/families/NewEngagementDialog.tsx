import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  InputAdornment,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { DatePicker } from "@mui/x-date-pickers";
import dayjs, { type Dayjs } from "dayjs";
import { useMutation, useQuery } from "@tanstack/react-query";

import { api } from "../../api/client";
import { LabeledField } from "../../components/LabeledField";

interface StudentChoice {
  id: string;
  name: string;
  current_grade?: string | null;
}

interface EngagementTypeOption {
  id: string;
  code: string;
  label: string;
  description: string | null;
  deleted_at: string | null;
}

/**
 * Quick "New engagement" flow. On save, POSTs to
 * /api/families/{id}/engagements, then (optionally) bulk-seeds the
 * catalog's service items into engagement_tasks so the operator
 * lands on a populated phase checklist.
 */
export function NewEngagementDialog({
  open,
  familyId,
  familyName,
  students,
  onClose,
  onCreated,
}: {
  open: boolean;
  familyId: string;
  familyName: string;
  students: StudentChoice[];
  onClose: () => void;
  onCreated: (engagementId: string) => void;
}) {
  const [studentId, setStudentId] = useState<string>("");
  const [engagementType, setEngagementType] = useState<string>("");
  const [startDate, setStartDate] = useState<Dayjs | null>(dayjs());
  const [targetEndDate, setTargetEndDate] = useState<Dayjs | null>(null);
  const [rate, setRate] = useState("");
  const [notes, setNotes] = useState("");
  const [seedFromCatalog, setSeedFromCatalog] = useState(true);

  const engagementTypes = useQuery<EngagementTypeOption[], Error>({
    queryKey: ["engagement-types"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await api.GET("/api/engagement-types", {});
      if (error || !data) throw new Error("Failed to load engagement types.");
      return (data as unknown as EngagementTypeOption[]).filter(
        (t) => !t.deleted_at,
      );
    },
  });

  // Default to the family's first student and the lowest-sort-order
  // engagement type once both arrive.
  useEffect(() => {
    if (open && !studentId && students[0]) setStudentId(students[0].id);
  }, [open, students, studentId]);
  useEffect(() => {
    if (open && !engagementType && engagementTypes.data && engagementTypes.data[0]) {
      setEngagementType(engagementTypes.data[0].code);
    }
  }, [open, engagementType, engagementTypes.data]);

  const create = useMutation({
    mutationFn: async (): Promise<{ id: string }> => {
      const { data, error } = await api.POST(
        "/api/families/{family_id}/engagements",
        {
          params: { path: { family_id: familyId } },
          body: {
            student_id: studentId,
            engagement_type: engagementType,
            start_date: startDate?.isValid() ? startDate.format("YYYY-MM-DD") : null,
            target_end_date: targetEndDate?.isValid()
              ? targetEndDate.format("YYYY-MM-DD")
              : null,
            default_hourly_rate: rate.trim() || null,
            notes: notes.trim() || null,
          } as never,
        },
      );
      if (error || !data) {
        const msg =
          (error as { detail?: string } | undefined)?.detail ??
          "Failed to start engagement.";
        throw new Error(msg);
      }
      const eng = data as unknown as { id: string };

      // Optional: seed the catalog into engagement_tasks. Two-step
      // because the catalog endpoint needs the engagement to exist
      // first (it filters by engagement_type scopes). The endpoint
      // returns a list of phases, each with an embedded `items[]`,
      // so flatten the nested items to get every service_item_id.
      if (seedFromCatalog) {
        const cat = await api.GET(
          "/api/engagements/{engagement_id}/catalog",
          { params: { path: { engagement_id: eng.id } } },
        );
        const phases = (cat.data as unknown as Array<{
          items?: Array<{ id: string }>;
        }> | undefined) ?? [];
        const itemIds = phases.flatMap((p) => (p.items ?? []).map((i) => i.id));
        if (itemIds.length > 0) {
          await api.POST(
            "/api/engagements/{engagement_id}/tasks/bulk-from-catalog",
            {
              params: { path: { engagement_id: eng.id } },
              body: { service_item_ids: itemIds } as never,
            },
          );
        }
      }
      return eng;
    },
    onSuccess: (eng) => {
      onCreated(eng.id);
      reset();
      onClose();
    },
  });

  const reset = () => {
    setStudentId("");
    setEngagementType("");
    setStartDate(dayjs());
    setTargetEndDate(null);
    setRate("");
    setNotes("");
    setSeedFromCatalog(true);
    create.reset();
  };

  const handleClose = () => {
    if (create.isPending) return;
    reset();
    onClose();
  };

  const liveTypes = engagementTypes.data ?? [];
  const hint = liveTypes.find((t) => t.code === engagementType)?.description ?? undefined;
  const submitDisabled = create.isPending || !studentId || !engagementType;

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <DialogTitle>Start engagement for {familyName}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {students.length === 0 ? (
              <Alert severity="warning">
                This family has no students yet. Add a student first on the
                family page, then start an engagement.
              </Alert>
            ) : (
              <LabeledField label="Student" required>
                <TextField
                  select
                  required
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value)}
                  fullWidth
                >
                  {students.map((s) => (
                    <MenuItem key={s.id} value={s.id}>
                      {s.name}
                      {s.current_grade ? ` · Grade ${s.current_grade}` : ""}
                    </MenuItem>
                  ))}
                </TextField>
              </LabeledField>
            )}

            <LabeledField label="Type" helperText={hint}>
              <TextField
                select
                value={engagementType}
                onChange={(e) => setEngagementType(e.target.value)}
                fullWidth
                disabled={engagementTypes.isPending || liveTypes.length === 0}
              >
                {liveTypes.map((t) => (
                  <MenuItem key={t.code} value={t.code}>
                    {t.label}
                  </MenuItem>
                ))}
              </TextField>
            </LabeledField>

            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <LabeledField label="Start date">
                <DatePicker
                  value={startDate}
                  onChange={(v) => setStartDate(v)}
                  slotProps={{ textField: { fullWidth: true } }}
                />
              </LabeledField>
              <LabeledField label="Target end (optional)">
                <DatePicker
                  value={targetEndDate}
                  onChange={(v) => setTargetEndDate(v)}
                  slotProps={{ textField: { fullWidth: true } }}
                />
              </LabeledField>
            </Stack>

            <LabeledField label="Hourly rate (optional)">
              <TextField
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                fullWidth
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">$</InputAdornment>
                  ),
                  endAdornment: (
                    <InputAdornment position="end">/hr</InputAdornment>
                  ),
                }}
                placeholder="e.g. 200"
              />
            </LabeledField>

            <LabeledField label="Notes (optional)">
              <TextField
                multiline
                minRows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                fullWidth
              />
            </LabeledField>

            <FormControlLabel
              control={
                <Checkbox
                  checked={seedFromCatalog}
                  onChange={(e) => setSeedFromCatalog(e.target.checked)}
                />
              }
              label={
                <Typography variant="body2">
                  Seed phase checklist from catalog
                </Typography>
              }
            />

            {create.error && (
              <Alert severity="error">{create.error.message}</Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} disabled={create.isPending}>Cancel</Button>
          <Button
            type="submit"
            variant="contained"
            disabled={submitDisabled || students.length === 0}
          >
            {create.isPending ? "Starting…" : "Start engagement"}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
