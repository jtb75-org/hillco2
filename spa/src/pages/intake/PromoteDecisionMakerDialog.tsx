import { useEffect, useState } from "react";
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

import { LabeledField } from "../../components/LabeledField";

import type { DecisionMaker } from "./intakeTypes";

interface PromoteResult {
  /** The newly-linked person_id (so the caller can swap their
   *  decision_makers entry + open the ParentDrawer for it). */
  person_id: string;
  /** The full decision_makers array to PATCH back onto the intake. */
  next_decision_makers: DecisionMaker[];
}

/**
 * Free-text decision-makers don't have a person record to drill into.
 * This dialog promotes the entry into a real family guardian: POST
 * /api/families/{id}/parents to create the guardian, then PATCH the
 * intake's decision_makers array to replace the free-text entry with
 * one linked by person_id. Caller opens ParentDrawer for the new
 * person to round out contact info.
 */
export function PromoteDecisionMakerDialog({
  open,
  familyId,
  intakeId,
  decisionMaker,
  decisionMakerIndex,
  allDecisionMakers,
  onClose,
  onPromoted,
}: {
  open: boolean;
  familyId: string;
  intakeId: string;
  decisionMaker: DecisionMaker | null;
  decisionMakerIndex: number | null;
  allDecisionMakers: DecisionMaker[];
  onClose: () => void;
  onPromoted: (result: PromoteResult) => void;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  // Reset on open. Pre-split the existing name into first/last
  // (first token → first_name, rest → last_name).
  useEffect(() => {
    if (!open || !decisionMaker) return;
    const trimmed = decisionMaker.name.trim();
    const space = trimmed.indexOf(" ");
    if (space === -1) {
      setFirstName(trimmed);
      setLastName("");
    } else {
      setFirstName(trimmed.slice(0, space));
      setLastName(trimmed.slice(space + 1).trim());
    }
    setEmail("");
    setPhone("");
  }, [open, decisionMaker]);

  const promote = useMutation({
    mutationFn: async (): Promise<PromoteResult> => {
      if (!decisionMaker || decisionMakerIndex == null) {
        throw new Error("nothing to promote");
      }
      // Map relation hint to the backend's ParentRole enum
      // (mom / dad / guardian / other). Anything we can't infer
      // defaults to "other".
      const relationLower = (decisionMaker.relation ?? "").toLowerCase();
      const role: "mom" | "dad" | "guardian" | "other" = (() => {
        if (relationLower.includes("mom") || relationLower.includes("mother"))
          return "mom";
        if (relationLower.includes("dad") || relationLower.includes("father"))
          return "dad";
        if (relationLower.includes("guardian")) return "guardian";
        return "other";
      })();
      const res = await fetch(`/api/families/${familyId}/parents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          first_name: firstName.trim(),
          last_name: lastName.trim() || null,
          email: email.trim() || null,
          phone: phone.trim() || null,
          role,
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(
          (json as { detail?: string }).detail ?? "Failed to add guardian.",
        );
      }
      const created = (await res.json()) as { id: string };

      // Replace the free-text entry with one linked by person_id.
      const next = allDecisionMakers.map((dm, i) =>
        i === decisionMakerIndex
          ? {
              person_id: created.id,
              name: `${firstName.trim()} ${lastName.trim()}`.trim(),
              relation: dm.relation ?? "",
            }
          : dm,
      );
      const patchRes = await fetch(`/api/intakes/${intakeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ decision_makers: next }),
      });
      if (!patchRes.ok) {
        const json = await patchRes.json().catch(() => ({}));
        throw new Error(
          (json as { detail?: string }).detail ??
            "Guardian created but decision-maker link failed.",
        );
      }
      return { person_id: created.id, next_decision_makers: next };
    },
    onSuccess: (result) => {
      onPromoted(result);
    },
  });

  const submitDisabled = promote.isPending || !firstName.trim();

  return (
    <Dialog open={open} onClose={promote.isPending ? undefined : onClose} maxWidth="xs" fullWidth>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!submitDisabled) promote.mutate();
        }}
      >
        <DialogTitle>Promote to family guardian?</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              {decisionMaker?.name ?? "This decision-maker"} isn't yet a
              guardian on the family record. Promoting creates a real
              guardian entry so you can capture contact info, link them to
              this intake, and drill into their drawer like any other
              guardian.
            </Typography>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <LabeledField label="First name" required>
                <TextField
                  autoFocus
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  fullWidth
                />
              </LabeledField>
              <LabeledField label="Last name">
                <TextField
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  fullWidth
                />
              </LabeledField>
            </Stack>
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
            {promote.error && (
              <Alert severity="error">{promote.error.message}</Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={promote.isPending}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={submitDisabled}>
            {promote.isPending ? "Promoting…" : "Promote"}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
