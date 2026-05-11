import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
} from "@mui/material";
import { useMutation } from "@tanstack/react-query";

import { api } from "../../api/client";
import type { components } from "../../api/schema";
import { LabeledField } from "../../components/LabeledField";

type PersonCreate = components["schemas"]["PersonCreate"];
type Kind = PersonCreate["kind"];

const KIND_OPTIONS: Array<{ value: Kind; label: string; hint?: string }> = [
  { value: "other", label: "Other", hint: "Just an address-book entry, unaffiliated." },
  { value: "guardian", label: "Guardian", hint: "Link to a family later from the family page." },
  { value: "student", label: "Student", hint: "Link to a family later from the family page." },
];

/**
 * Minimal "new contact" form. Backed by POST /api/people, which creates
 * the people row and the kind-specific supporting row (student_details
 * for students). Mailing address is structured (street + city/state/zip);
 * the operator can fill in more from the contact drawer afterward.
 *
 * school_worker isn't an option here — school_worker_details requires
 * a school_id, so those get created from the school flow instead.
 */
export function AddContactDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [kind, setKind] = useState<Kind>("other");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const create = useMutation({
    mutationFn: async (): Promise<{ id: string }> => {
      const { data, error: respError } = await api.POST("/api/people", {
        body: {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          kind,
          email: email.trim() || null,
          phone: phone.trim() || null,
        },
      });
      if (respError || !data) {
        const msg =
          (respError as { detail?: string } | undefined)?.detail ??
          "Failed to create contact.";
        throw new Error(msg);
      }
      return data as unknown as { id: string };
    },
    onSuccess: (row) => {
      onCreated(row.id);
      reset();
      onClose();
    },
  });

  const reset = () => {
    setFirstName("");
    setLastName("");
    setKind("other");
    setEmail("");
    setPhone("");
    create.reset();
  };

  const handleClose = () => {
    if (create.isPending) return;
    reset();
    onClose();
  };

  // Mirror the backend pattern validation so the user catches the
  // typo before submit.
  const emailTrimmed = email.trim();
  const emailLooksValid =
    !emailTrimmed || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed);
  const submitDisabled =
    create.isPending ||
    !firstName.trim() ||
    !lastName.trim() ||
    !emailLooksValid;

  const kindHint = KIND_OPTIONS.find((o) => o.value === kind)?.hint;

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <DialogTitle>Add contact</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
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
            <LabeledField label="Kind" helperText={kindHint}>
              <TextField
                select
                value={kind}
                onChange={(e) => setKind(e.target.value as Kind)}
                fullWidth
              >
                {KIND_OPTIONS.map((o) => (
                  <MenuItem key={o.value} value={o.value}>
                    {o.label}
                  </MenuItem>
                ))}
              </TextField>
            </LabeledField>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <LabeledField label="Email">
                <TextField
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  fullWidth
                  error={!emailLooksValid}
                  helperText={!emailLooksValid ? "Invalid email." : undefined}
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
              <Stack spacing={0.5}>
                <Box component="span" sx={{ fontSize: 12, color: "text.secondary" }}>
                  Address, family link, and additional details can be filled in
                  from the contact's drawer once they're created.
                </Box>
              </Stack>
            </Box>
            {create.error && (
              <Alert severity="error">{create.error.message}</Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} disabled={create.isPending}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={submitDisabled}>
            {create.isPending ? "Saving…" : "Add"}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
