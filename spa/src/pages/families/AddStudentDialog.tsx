import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Link,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useMutation } from "@tanstack/react-query";

import { api } from "../../api/client";
import type { components } from "../../api/schema";
import { LabeledField } from "../../components/LabeledField";
import { PersonSearchField } from "../../components/PersonSearchField";

type StudentCreate = components["schemas"]["StudentCreate"];
type PersonRow = components["schemas"]["PersonListRow"];

type Mode =
  | { kind: "searching" }
  | { kind: "picked"; person: PersonRow }
  | { kind: "creating" };

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
  const [mode, setMode] = useState<Mode>({ kind: "searching" });
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
    setMode({ kind: "searching" });
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

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode.kind === "picked") {
      create.mutate({ person_id: mode.person.id });
    } else if (mode.kind === "creating") {
      create.mutate({
        name: name.trim(),
        dob: dob || null,
        current_grade: grade.trim() || null,
      });
    }
  };

  const submitLabel = mode.kind === "picked" ? "Link" : "Add";
  const submitDisabled =
    create.isPending ||
    mode.kind === "searching" ||
    (mode.kind === "creating" && !name.trim());

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <form onSubmit={onSubmit}>
        <DialogTitle>Add student</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {mode.kind === "searching" && (
              <LabeledField
                label="Name"
                required
                helperText="Search existing students, or type a new name and pick &quot;Add new&quot;."
              >
                <PersonSearchField
                  autoFocus
                  kind="student"
                  onPickExisting={(person) => setMode({ kind: "picked", person })}
                  onCreateNew={(typed) => {
                    setName(typed);
                    setMode({ kind: "creating" });
                  }}
                  placeholder="Search students by name…"
                />
              </LabeledField>
            )}

            {mode.kind === "picked" && (
              <Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                  Linking existing student
                </Typography>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Chip
                    label={formatPersonChip(mode.person)}
                    onDelete={() => setMode({ kind: "searching" })}
                  />
                  <Link
                    component="button"
                    type="button"
                    variant="caption"
                    onClick={() => setMode({ kind: "searching" })}
                  >
                    change
                  </Link>
                </Stack>
                <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
                  Grade, DOB, and clinical fields stay on the existing student record.
                </Typography>
              </Box>
            )}

            {mode.kind === "creating" && (
              <>
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
                <Box>
                  <Link
                    component="button"
                    type="button"
                    variant="caption"
                    onClick={() => setMode({ kind: "searching" })}
                  >
                    ← search existing instead
                  </Link>
                </Box>
              </>
            )}

            {create.error && (
              <Alert severity="error">{create.error.message}</Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} disabled={create.isPending}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={submitDisabled}>
            {submitLabel}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

function formatPersonChip(p: PersonRow): string {
  const name = `${p.first_name}${p.last_name ? " " + p.last_name : ""}`.trim();
  const bits: string[] = [name];
  if (p.current_grade) bits.push(p.current_grade);
  if (p.family_household_name) bits.push(`${p.family_household_name} family`);
  return bits.join(" · ");
}
