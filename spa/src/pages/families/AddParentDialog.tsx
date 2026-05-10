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

type ParentCreate = components["schemas"]["ParentCreate"];
type PersonRow = components["schemas"]["PersonListRow"];

type Mode =
  | { kind: "searching" }
  | { kind: "picked"; person: PersonRow }
  | { kind: "creating"; presetName: string };

/**
 * Lightweight create-then-edit flow: this dialog only collects the
 * minimum needed to insert a parent (first + last name, or a linked
 * existing person). After save, the parent appears on the family page
 * and the caller opens the detail drawer for everything else
 * (email, address, flags, role).
 */
export function AddParentDialog({
  open,
  familyId,
  onClose,
  onCreated,
}: {
  open: boolean;
  familyId: string;
  onClose: () => void;
  /** Receives the freshly-created (or linked) parent row so the caller
   *  can pop the detail drawer for follow-up edits. */
  onCreated: (parentId: string) => void;
}) {
  const [mode, setMode] = useState<Mode>({ kind: "searching" });
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

  const create = useMutation({
    mutationFn: async (body: ParentCreate): Promise<{ id: string }> => {
      const { data, error: respError } = await api.POST(
        "/api/families/{family_id}/parents",
        { params: { path: { family_id: familyId } }, body },
      );
      if (respError || !data) {
        const msg =
          (respError as { detail?: string } | undefined)?.detail ??
          "Failed to add parent.";
        throw new Error(msg);
      }
      return data as unknown as { id: string };
    },
    onSuccess: (created) => {
      onCreated(created.id);
      reset();
      onClose();
    },
  });

  const reset = () => {
    setMode({ kind: "searching" });
    setFirstName("");
    setLastName("");
    create.reset();
  };

  const handleClose = () => {
    if (create.isPending) return;
    reset();
    onClose();
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Backend defaults role to "other" and both flags to False; the
    // operator promotes/flags via the detail drawer that opens next.
    const defaults = {
      role: "other" as const,
      is_primary_contact: false,
      is_billing_contact: false,
    };
    if (mode.kind === "picked") {
      create.mutate({ person_id: mode.person.id, ...defaults });
    } else if (mode.kind === "creating") {
      create.mutate({
        first_name: firstName.trim(),
        last_name: lastName.trim() || null,
        ...defaults,
      });
    }
  };

  const submitLabel = mode.kind === "picked" ? "Link" : "Add";
  const submitDisabled =
    create.isPending ||
    mode.kind === "searching" ||
    (mode.kind === "creating" && (!firstName.trim() || !lastName.trim()));

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
      <form onSubmit={onSubmit}>
        <DialogTitle>Add parent / guardian</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {mode.kind === "searching" && (
              <LabeledField
                label="Name"
                required
                helperText="Search the contact list, or type a new name and pick &quot;Add new&quot;."
              >
                <PersonSearchField
                  autoFocus
                  onPickExisting={(person) => {
                    setMode({ kind: "picked", person });
                  }}
                  onCreateNew={(typed) => {
                    const trimmed = typed.trim();
                    const idx = trimmed.indexOf(" ");
                    if (idx === -1) {
                      setFirstName(trimmed);
                      setLastName("");
                    } else {
                      setFirstName(trimmed.slice(0, idx));
                      setLastName(trimmed.slice(idx + 1).trim());
                    }
                    setMode({ kind: "creating", presetName: trimmed });
                  }}
                />
              </LabeledField>
            )}

            {mode.kind === "picked" && (
              <Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                  Linking existing contact
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
              </Box>
            )}

            {mode.kind === "creating" && (
              <>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                  <LabeledField label="First name" required>
                    <TextField
                      autoFocus
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
                <Typography variant="caption" color="text.secondary">
                  You'll add email, address, and other details on the next step.
                </Typography>
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
  if (p.family_household_name) return `${name} · ${p.family_household_name} family`;
  return name;
}
