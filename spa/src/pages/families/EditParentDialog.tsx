import { useEffect, useState } from "react";
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

type ParentUpdate = components["schemas"]["ParentUpdate"];
type Role = NonNullable<ParentUpdate["role"]>;

const ROLE_OPTIONS: Role[] = ["mom", "dad", "guardian", "other"];

// Reusing the shape from FamilyDetail rather than importing — keeps the
// hand-typed Parent interface single-sourced over there. The fields we
// need are a subset.
export interface ParentEditTarget {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string;
  is_billing_contact: boolean;
  mailing_address: string | null;
}

export function EditParentDialog({
  open,
  parent,
  onClose,
  onSaved,
}: {
  open: boolean;
  parent: ParentEditTarget | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  // Split the composed name back into first/last so the form has them
  // as separate fields. Edge: a single-token name lands entirely in
  // first; the user can fix the split if it's wrong.
  const initialFirst = (parent?.name || "").split(/\s+/)[0] ?? "";
  const initialLast = (parent?.name || "").split(/\s+/).slice(1).join(" ");

  const [firstName, setFirstName] = useState(initialFirst);
  const [lastName, setLastName] = useState(initialLast);
  const [email, setEmail] = useState(parent?.email ?? "");
  const [phone, setPhone] = useState(parent?.phone ?? "");
  // We render `mailing_address` as a composed block today; the structured
  // pieces aren't surfaced individually on the read side, so we ask the
  // operator to re-enter them here when editing. Future: include the
  // structured cols in family_detail's response so we can prefill.
  const [street1, setStreet1] = useState("");
  const [street2, setStreet2] = useState("");
  const [city, setCity] = useState("");
  const [stateCode, setStateCode] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [role, setRole] = useState<Role>((parent?.role as Role) || "other");

  // Reset state when a different parent is opened.
  useEffect(() => {
    if (!parent) return;
    const parts = (parent.name || "").split(/\s+/);
    setFirstName(parts[0] ?? "");
    setLastName(parts.slice(1).join(" "));
    setEmail(parent.email ?? "");
    setPhone(parent.phone ?? "");
    setStreet1("");
    setStreet2("");
    setCity("");
    setStateCode("");
    setPostalCode("");
    setRole((parent.role as Role) || "other");
  }, [parent]);

  const save = useMutation({
    mutationFn: async () => {
      if (!parent) throw new Error("no parent");
      const body: ParentUpdate = {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        role,
      };
      // Only include address fields the user actually filled in.
      // Empty → null clears that column; untouched stays unchanged.
      if (street1) body.street1 = street1.trim();
      if (street2) body.street2 = street2.trim();
      if (city) body.city = city.trim();
      if (stateCode) body.state = stateCode.trim();
      if (postalCode) body.postal_code = postalCode.trim();
      const { data, error: respError } = await api.PATCH(
        "/api/parents/{parent_id}",
        { params: { path: { parent_id: parent.id } }, body },
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

  const isBilling = !!parent?.is_billing_contact;
  const emailTrimmed = email.trim();
  const zipTrimmed = postalCode.trim();
  const emailLooksValid = !emailTrimmed || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed);
  const zipLooksValid = !zipTrimmed || /^\d{5}(-\d{4})?$/.test(zipTrimmed);

  // Billing parents must keep email + street + zip. If the operator
  // hasn't touched address, the existing value stays (we don't send the
  // column at all), so we only block on email here. Backend re-validates
  // post-merge.
  const submitDisabled =
    save.isPending ||
    !firstName.trim() ||
    !lastName.trim() ||
    !emailLooksValid ||
    !zipLooksValid ||
    (isBilling && !emailTrimmed);

  return (
    <Dialog
      open={open && !!parent}
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
        <DialogTitle>Edit parent / guardian</DialogTitle>
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
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <LabeledField label="Email" required={isBilling}>
                <TextField
                  type="email"
                  required={isBilling}
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
            <LabeledField
              label="Street address"
              helperText={
                parent?.mailing_address
                  ? `Current: ${parent.mailing_address.split("\n")[0]}${
                      parent.mailing_address.includes("\n") ? "…" : ""
                    }. Fill these to replace.`
                  : "Leave blank to keep the current address unchanged."
              }
            >
              <TextField
                placeholder="123 Main St"
                value={street1}
                onChange={(e) => setStreet1(e.target.value)}
                fullWidth
                inputProps={{ maxLength: 200 }}
              />
            </LabeledField>
            <LabeledField label="Apt / suite / unit">
              <TextField
                placeholder="Apt 4B"
                value={street2}
                onChange={(e) => setStreet2(e.target.value)}
                fullWidth
                inputProps={{ maxLength: 100 }}
              />
            </LabeledField>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <Box sx={{ flex: 2 }}>
                <LabeledField label="City">
                  <TextField
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    fullWidth
                    inputProps={{ maxLength: 100 }}
                  />
                </LabeledField>
              </Box>
              <Box sx={{ flex: 1 }}>
                <LabeledField label="State">
                  <TextField
                    placeholder="IL"
                    value={stateCode}
                    onChange={(e) => setStateCode(e.target.value)}
                    fullWidth
                    inputProps={{ maxLength: 50 }}
                  />
                </LabeledField>
              </Box>
              <Box sx={{ flex: 1 }}>
                <LabeledField label="ZIP / postal">
                  <TextField
                    placeholder="62701"
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value)}
                    fullWidth
                    inputProps={{ maxLength: 10 }}
                    error={!zipLooksValid}
                    helperText={!zipLooksValid ? "Use 5 digits or ZIP+4." : undefined}
                  />
                </LabeledField>
              </Box>
            </Stack>
            <LabeledField label="Relationship">
              <TextField
                select
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
                fullWidth
              >
                {ROLE_OPTIONS.map((r) => (
                  <MenuItem key={r} value={r}>{r}</MenuItem>
                ))}
              </TextField>
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
