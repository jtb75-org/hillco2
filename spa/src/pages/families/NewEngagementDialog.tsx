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
import { useMutation } from "@tanstack/react-query";

import { api } from "../../api/client";
import { LabeledField } from "../../components/LabeledField";

interface StudentChoice {
  id: string;
  name: string;
  current_grade?: string | null;
}

type EngagementType = "assessment" | "full_placement";

const TYPE_OPTIONS: Array<{ value: EngagementType; label: string; hint: string }> = [
  {
    value: "assessment",
    label: "Assessment",
    hint: "Just the assessment-scope phases (intake, doc review, profile).",
  },
  {
    value: "full_placement",
    label: "Full placement",
    hint: "Assessment + placement scope (search process, feedback, package).",
  },
];

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
  const [engagementType, setEngagementType] = useState<EngagementType>("assessment");
  const [startDate, setStartDate] = useState<Dayjs | null>(dayjs());
  const [targetEndDate, setTargetEndDate] = useState<Dayjs | null>(null);
  const [rate, setRate] = useState("");
  const [notes, setNotes] = useState("");
  const [seedFromCatalog, setSeedFromCatalog] = useState(true);

  // Default to the family's first student.
  useEffect(() => {
    if (open && !studentId && students[0]) setStudentId(students[0].id);
  }, [open, students, studentId]);

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
      // first (it filters by engagement_type scopes).
      if (seedFromCatalog) {
        const cat = await api.GET(
          "/api/engagements/{engagement_id}/catalog",
          { params: { path: { engagement_id: eng.id } } },
        );
        if (cat.data) {
          const items = (cat.data as unknown as {
            service_items: Array<{ id: string }>;
          }).service_items;
          if (items.length > 0) {
            await api.POST(
              "/api/engagements/{engagement_id}/tasks/bulk-from-catalog",
              {
                params: { path: { engagement_id: eng.id } },
                body: {
                  service_item_ids: items.map((s) => s.id),
                } as never,
              },
            );
          }
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
    setEngagementType("assessment");
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

  const hint = TYPE_OPTIONS.find((t) => t.value === engagementType)?.hint;
  const submitDisabled = create.isPending || !studentId;

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
                onChange={(e) => setEngagementType(e.target.value as EngagementType)}
                fullWidth
              >
                {TYPE_OPTIONS.map((t) => (
                  <MenuItem key={t.value} value={t.value}>
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
