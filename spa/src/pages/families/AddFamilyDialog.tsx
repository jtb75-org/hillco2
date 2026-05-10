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
  Typography,
} from "@mui/material";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { api } from "../../api/client";
import type { components } from "../../api/schema";

type FamilyCreate = components["schemas"]["FamilyCreate"];
// Parent billing fields ride on the parent row (post-0007), so the
// family-create dialog only collects the household name + notes; you
// add the billing contact when you add the first parent on detail.

export function AddFamilyDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const navigate = useNavigate();
  const [householdName, setHouseholdName] = useState("");
  const [notes, setNotes] = useState("");

  const create = useMutation({
    mutationFn: async (body: FamilyCreate) => {
      const { data, error: respError } = await api.POST("/api/families", { body });
      if (respError || !data) {
        const msg =
          (respError as { detail?: string } | undefined)?.detail ??
          "Failed to create family.";
        throw new Error(msg);
      }
      return data as { id: string };
    },
    onSuccess: (created) => {
      onCreated();
      reset();
      onClose();
      // Drop the user straight into the new family's detail page so the
      // next thing they want to do — add a parent and a student — is
      // one click away.
      navigate(`/families/${created.id}`);
    },
  });

  const reset = () => {
    setHouseholdName("");
    setNotes("");
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
            household_name: householdName.trim(),
            notes: notes.trim() || null,
          });
        }}
      >
        <DialogTitle>Add family</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              autoFocus
              required
              label="Household name"
              placeholder='e.g. "Smith Family"'
              value={householdName}
              onChange={(e) => setHouseholdName(e.target.value)}
              fullWidth
              inputProps={{ maxLength: 200 }}
            />
            <TextField
              label="Notes (optional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              fullWidth
              multiline
              rows={3}
              // MUI v6 outlined-multiline doesn't notch the border when the
              // label shrinks, so a focused/filled label sits on the line
              // and reads as a strikethrough. Forcing shrink=true keeps the
              // label permanently in the top-cutout position with a clean
              // notch — the trade-off is the label no longer animates from
              // inside the field on first focus, which is fine for a
              // permanently-labelled "Notes" textarea.
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <Typography variant="caption" color="text.secondary">
              You can add parents (with billing contact) and students from the
              family's detail page after it's created.
            </Typography>
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
            disabled={create.isPending || !householdName.trim()}
          >
            Add
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
