import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
} from "@mui/material";
import { useMutation } from "@tanstack/react-query";

import { api } from "../../api/client";
import { LabeledField } from "../../components/LabeledField";

export interface StudentEditTarget {
  id: string;
  name: string;
  current_grade: string | null;
}

export function EditStudentDialog({
  open,
  student,
  onClose,
  onSaved,
}: {
  open: boolean;
  student: StudentEditTarget | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [grade, setGrade] = useState("");

  useEffect(() => {
    if (!student) return;
    const parts = (student.name || "").split(/\s+/);
    setFirstName(parts[0] ?? "");
    setLastName(parts.slice(1).join(" "));
    setGrade(student.current_grade ?? "");
  }, [student]);

  const save = useMutation({
    mutationFn: async () => {
      if (!student) throw new Error("no student");
      const { data, error: respError } = await api.PATCH(
        "/api/students/{student_id}",
        {
          params: { path: { student_id: student.id } },
          body: {
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            current_grade: grade.trim() || null,
          },
        },
      );
      if (respError || !data) {
        const msg =
          (respError as { detail?: string } | undefined)?.detail ??
          "Failed to save.";
        throw new Error(msg);
      }
      return data;
    },
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });

  const submitDisabled =
    save.isPending || !firstName.trim() || !lastName.trim();

  return (
    <Dialog
      open={open && !!student}
      onClose={() => !save.isPending && onClose()}
      maxWidth="sm"
      fullWidth
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <DialogTitle>Edit student</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <LabeledField label="First name" required>
                <TextField
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  fullWidth
                  inputProps={{ maxLength: 100 }}
                />
              </LabeledField>
              <LabeledField label="Last name" required>
                <TextField
                  required
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  fullWidth
                  inputProps={{ maxLength: 100 }}
                />
              </LabeledField>
            </Stack>
            <LabeledField label="Current grade">
              <TextField
                placeholder='e.g. "8th"'
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
                fullWidth
              />
            </LabeledField>
            {save.error && <Alert severity="error">{save.error.message}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={save.isPending}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={submitDisabled}>
            Save
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
