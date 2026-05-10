import { useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Stack,
  TextField,
} from "@mui/material";
import { useMutation } from "@tanstack/react-query";

import { api } from "../../api/client";
import type { components } from "../../api/schema";
import { LabeledField } from "../../components/LabeledField";

type ParentCreate = components["schemas"]["ParentCreate"];

const ROLE_OPTIONS: Array<ParentCreate["role"]> = ["mom", "dad", "guardian", "other"];

// TODO: typeahead picker over /api/people for selecting an existing
// contact (kind in {guardian, other}). Today this dialog only creates
// a fresh person + family_guardians row. Linking an existing person
// needs a small backend extension to /api/families/{id}/parents
// (accept optional person_id) — out of scope for this PR.

export function AddParentDialog({
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
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<ParentCreate["role"]>("other");
  const [isPrimary, setIsPrimary] = useState(false);
  const [isBilling, setIsBilling] = useState(false);

  const create = useMutation({
    mutationFn: async (body: ParentCreate) => {
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
    setEmail("");
    setPhone("");
    setRole("other");
    setIsPrimary(false);
    setIsBilling(false);
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
            email: email.trim() || null,
            phone: phone.trim() || null,
            role,
            is_primary_contact: isPrimary,
            is_billing_contact: isBilling,
          });
        }}
      >
        <DialogTitle>Add parent / guardian</DialogTitle>
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
              <LabeledField label="Email">
                <TextField
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  fullWidth
                />
              </LabeledField>
              <LabeledField label="Phone">
                <TextField
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  fullWidth
                />
              </LabeledField>
            </Stack>
            <LabeledField label="Relationship">
              <TextField
                select
                value={role}
                onChange={(e) => setRole(e.target.value as ParentCreate["role"])}
                fullWidth
              >
                {ROLE_OPTIONS.map((r) => (
                  <MenuItem key={r} value={r}>{r}</MenuItem>
                ))}
              </TextField>
            </LabeledField>
            <Stack direction="row" spacing={3}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={isPrimary}
                    onChange={(e) => setIsPrimary(e.target.checked)}
                  />
                }
                label="Primary contact"
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={isBilling}
                    onChange={(e) => setIsBilling(e.target.checked)}
                  />
                }
                label="Billing contact"
              />
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
