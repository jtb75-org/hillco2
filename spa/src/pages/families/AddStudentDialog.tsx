import { useState } from "react";
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
import type { components } from "../../api/schema";
import { LabeledField } from "../../components/LabeledField";

type StudentCreate = components["schemas"]["StudentCreate"];

// TODO: typeahead picker over /api/people?kind=student for selecting
// an existing student (rare, but useful when a family adopts an
// existing-in-system kid). Today we only create new.

export function AddStudentDialog({
  open,
  familyId,
  onClose,
  onCreated,
}: {
  open: boolean;
  familyId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [dob, setDob] = useState("");
  const [grade, setGrade] = useState("");

  const create = useMutation({
    mutationFn: async (body: StudentCreate) => {
      const { data, error: respError } = await api.POST(
        "/api/families/{family_id}/students",
        { params: { path: { family_id: familyId } }, body },
      );
      if (respError || !data) {
        const msg =
          (respError as { detail?: string } | undefined)?.detail ??
          "Failed to add student.";
        throw new Error(msg);
      }
      return data;
    },
    onSuccess: () => {
      onCreated();
      reset();
      onClose();
    },
  });

  const reset = () => {
    setName("");
    setDob("");
    setGrade("");
    create.reset();
  };

  const handleClose = () => {
    if (create.isPending) return;
    reset();
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate({
            name: name.trim(),
            dob: dob || null,
            current_grade: grade.trim() || null,
          });
        }}
      >
        <DialogTitle>Add student</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <LabeledField label="Name" required>
              <TextField
                autoFocus
                required
                placeholder="First Last"
                value={name}
                onChange={(e) => setName(e.target.value)}
                fullWidth
                inputProps={{ maxLength: 200 }}
              />
            </LabeledField>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <LabeledField label="Date of birth">
                <TextField
                  type="date"
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                  fullWidth
                />
              </LabeledField>
              <LabeledField label="Current grade">
                <TextField
                  placeholder='e.g. "8th"'
                  value={grade}
                  onChange={(e) => setGrade(e.target.value)}
                  fullWidth
                />
              </LabeledField>
            </Stack>
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
            disabled={create.isPending || !name.trim()}
          >
            Add
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
