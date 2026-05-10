import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Link,
  MenuItem,
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

const ROLE_OPTIONS: Array<ParentCreate["role"]> = ["mom", "dad", "guardian", "other"];

type Mode =
  | { kind: "searching" }
  | { kind: "picked"; person: PersonRow }
  | { kind: "creating"; presetName: string };

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
  const [mode, setMode] = useState<Mode>({ kind: "searching" });
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
    setMode({ kind: "searching" });
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

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode.kind === "picked") {
      create.mutate({
        person_id: mode.person.id,
        role,
        is_primary_contact: isPrimary,
        is_billing_contact: isBilling,
      });
    } else if (mode.kind === "creating") {
      create.mutate({
        name: name.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        role,
        is_primary_contact: isPrimary,
        is_billing_contact: isBilling,
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
                  // Bias the dropdown to people who can plausibly be a
                  // guardian. Students are excluded server-side too.
                  // We omit the kind filter so 'other'/'school_worker'
                  // can also surface (e.g., a teacher who's also a parent).
                  onPickExisting={(person) => {
                    setMode({ kind: "picked", person });
                  }}
                  onCreateNew={(typed) => {
                    setName(typed);
                    setMode({ kind: "creating", presetName: typed });
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

            {mode.kind !== "searching" && (
              <>
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
