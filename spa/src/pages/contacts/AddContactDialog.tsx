import { useState } from "react";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
} from "@mui/material";
import { useMutation, useQuery } from "@tanstack/react-query";

import { api } from "../../api/client";
import { LabeledField } from "../../components/LabeledField";

interface SchoolOption {
  id: string;
  name: string;
}

/**
 * Add a school-affiliated contact (school worker). Picks a school
 * from the catalog — the POST /api/contacts route auto-classifies as
 * kind='school_worker' when school_id is present.
 *
 * Guardians and students aren't created here — they get added from
 * the family page. Platform users (consultants/admins) are managed
 * under Admin → Users.
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
  const [schoolId, setSchoolId] = useState("");
  const [role, setRole] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const schools = useQuery<SchoolOption[], Error>({
    queryKey: ["schools", "list", "add-contact"],
    enabled: open,
    queryFn: async () => {
      const res = await fetch("/api/schools", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load schools.");
      return (await res.json()) as SchoolOption[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const create = useMutation({
    mutationFn: async (): Promise<{ id: string }> => {
      const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
      const { data, error: respError } = await api.POST("/api/contacts", {
        body: {
          name: fullName,
          school_id: schoolId || null,
          role: role.trim() || null,
          email: email.trim() || null,
          phone: phone.trim() || null,
        } as never,
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
    setSchoolId("");
    setRole("");
    setEmail("");
    setPhone("");
    create.reset();
  };

  const handleClose = () => {
    if (create.isPending) return;
    reset();
    onClose();
  };

  const emailTrimmed = email.trim();
  const emailLooksValid =
    !emailTrimmed || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed);
  const submitDisabled =
    create.isPending ||
    !firstName.trim() ||
    !lastName.trim() ||
    !schoolId ||
    !emailLooksValid;

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
            <LabeledField label="School" required>
              <TextField
                select
                required
                value={schoolId}
                onChange={(e) => setSchoolId(e.target.value)}
                fullWidth
                disabled={schools.isPending}
                helperText={
                  schools.isPending ? "Loading schools…" : undefined
                }
              >
                {(schools.data ?? []).map((s) => (
                  <MenuItem key={s.id} value={s.id}>
                    {s.name}
                  </MenuItem>
                ))}
              </TextField>
            </LabeledField>
            <LabeledField label="Role">
              <TextField
                value={role}
                onChange={(e) => setRole(e.target.value)}
                fullWidth
                placeholder="Counselor, learning specialist, principal, …"
              />
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
            {create.error && (
              <Alert severity="error">{create.error.message}</Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} disabled={create.isPending}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={submitDisabled}>
            {create.isPending ? "Saving…" : "Add"}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
