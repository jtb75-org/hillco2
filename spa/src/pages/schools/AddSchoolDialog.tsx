import { useState } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
} from "@mui/material";

import { LabeledField } from "../../components/LabeledField";

/**
 * Minimal "new school" dialog. Just captures the name — everything else
 * (location, type, grade range, website, fit profile, notes) gets filled
 * in from the school drawer once the row exists.
 */
export function AddSchoolDialog({
  open,
  onClose,
  onSubmit,
  submitting,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (name: string) => void;
  submitting: boolean;
}) {
  const [name, setName] = useState("");

  const handleClose = () => {
    if (submitting) return;
    setName("");
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onSubmit(name.trim());
        }}
      >
        <DialogTitle>Add school</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <LabeledField label="Name" required>
              <TextField
                autoFocus
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                fullWidth
                inputProps={{ maxLength: 200 }}
              />
            </LabeledField>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={submitting || !name.trim()}
          >
            {submitting ? "Saving…" : "Add"}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
