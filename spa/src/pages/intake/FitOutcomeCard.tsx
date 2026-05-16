import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  FormControlLabel,
  Grid,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { DatePicker } from "@mui/x-date-pickers";
import dayjs from "dayjs";

import { LabeledField } from "../../components/LabeledField";

import type {
  EngagementTypeOption,
  IntakeDetail,
  IntakeStudent,
  NextStepOwner,
  Outcome,
} from "./intakeTypes";
import { NEXT_STEP_OWNER_LABEL, OUTCOME_LABEL } from "./intakeTypes";

/** Fit, outcome & next steps card. Wraps the per-student candidacy
 *  toggles, the outcome enum, next-step fields, and the contextual
 *  primary button (Convert when outcome=converting + ≥1 candidate,
 *  Save outcome otherwise). */
export function FitOutcomeCard({
  intake,
  engagementTypes,
  onPatchIntake,
  onPatchStudent,
  onConvert,
  converting,
}: {
  intake: IntakeDetail;
  engagementTypes: EngagementTypeOption[];
  onPatchIntake: (body: Partial<IntakeDetail>) => void;
  onPatchStudent: (personId: string, body: Partial<IntakeStudent>) => void;
  onConvert: () => Promise<{ engagement_ids: string[] } | null>;
  converting: boolean;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);

  // Local mirrors for the inputs that PATCH on blur.
  const [reason, setReason] = useState(intake.disposition_reason ?? "");
  const [blocker, setBlocker] = useState(intake.blocker ?? "");
  useEffect(() => setReason(intake.disposition_reason ?? ""), [intake.disposition_reason]);
  useEffect(() => setBlocker(intake.blocker ?? ""), [intake.blocker]);

  const candidates = intake.students.filter((s) => s.candidate);
  const candidateCount = candidates.length;
  const isConverting = intake.outcome === "converting";
  const alreadyConverted = intake.converted_at != null;

  const primaryLabel = isConverting ? "Convert to engagement →" : "Save outcome";
  const primaryDisabled =
    intake.outcome == null ||
    alreadyConverted ||
    (isConverting && candidateCount === 0) ||
    (isConverting &&
      candidates.some((c) => !c.recommended_engagement_type));
  const primaryHint = (() => {
    if (alreadyConverted) return "Already converted.";
    if (intake.outcome == null) return "Pick an intake outcome to enable.";
    if (isConverting && candidateCount === 0)
      return "Toggle at least one student as a candidate.";
    if (
      isConverting &&
      candidates.some((c) => !c.recommended_engagement_type)
    )
      return "Each candidate needs a recommended engagement type.";
    return "";
  })();

  const handlePrimary = async () => {
    if (isConverting && candidateCount >= 2) {
      setConfirmOpen(true);
      return;
    }
    if (isConverting && candidateCount === 1) {
      await fireConvert();
      return;
    }
    setResultMessage(
      `Saved outcome${
        intake.outcome ? ` — ${OUTCOME_LABEL[intake.outcome]}` : ""
      }.`,
    );
  };

  const fireConvert = async () => {
    setConfirmOpen(false);
    const result = await onConvert();
    if (result) {
      setResultMessage(
        `Created ${result.engagement_ids.length} engagement${
          result.engagement_ids.length === 1 ? "" : "s"
        }.`,
      );
    }
  };

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={0.25} sx={{ mb: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Fit, outcome &amp; next steps
          </Typography>
          <Typography variant="caption" color="text.secondary">
            The decision point at the end of intake.
          </Typography>
        </Stack>

        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
          Per-student candidacy
        </Typography>
        {intake.students.length === 0 ? (
          <Typography variant="body2" color="text.disabled" sx={{ mb: 2 }}>
            Add a student to this intake before assigning candidacy.
          </Typography>
        ) : (
          <Stack spacing={1.5} sx={{ mb: 2 }}>
            {intake.students.map((s) => (
              <StudentCandidacyRow
                key={s.id}
                student={s}
                engagementTypes={engagementTypes}
                onChange={(body) => onPatchStudent(s.id, body)}
              />
            ))}
          </Stack>
        )}

        <Divider sx={{ mb: 2 }} />

        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <LabeledField label="Intake outcome">
              <TextField
                select
                size="small"
                fullWidth
                value={intake.outcome ?? ""}
                onChange={(e) =>
                  onPatchIntake({
                    outcome: (e.target.value || null) as Outcome | null,
                  })
                }
                SelectProps={{ displayEmpty: true }}
              >
                <MenuItem value="">
                  <em>— In progress —</em>
                </MenuItem>
                {(Object.keys(OUTCOME_LABEL) as Outcome[]).map((o) => (
                  <MenuItem key={o} value={o}>
                    {OUTCOME_LABEL[o]}
                  </MenuItem>
                ))}
              </TextField>
            </LabeledField>
          </Grid>
          <Grid item xs={12} md={6}>
            <LabeledField label="Disposition reason / context">
              <TextField
                multiline
                minRows={2}
                fullWidth
                placeholder="Free text — useful for declined / nurture outcomes."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                onBlur={() => {
                  if (reason !== (intake.disposition_reason ?? "")) {
                    onPatchIntake({ disposition_reason: reason || null });
                  }
                }}
              />
            </LabeledField>
          </Grid>

          <Grid item xs={12} md={4}>
            <LabeledField label="Next step owner">
              <TextField
                select
                size="small"
                fullWidth
                value={intake.next_step_owner ?? ""}
                onChange={(e) =>
                  onPatchIntake({
                    next_step_owner:
                      (e.target.value || null) as NextStepOwner | null,
                  })
                }
                SelectProps={{ displayEmpty: true }}
              >
                <MenuItem value="">
                  <em>— Not set —</em>
                </MenuItem>
                {(Object.keys(NEXT_STEP_OWNER_LABEL) as NextStepOwner[]).map(
                  (o) => (
                    <MenuItem key={o} value={o}>
                      {NEXT_STEP_OWNER_LABEL[o]}
                    </MenuItem>
                  ),
                )}
              </TextField>
            </LabeledField>
          </Grid>
          <Grid item xs={12} md={4}>
            <LabeledField label="Next step due">
              <DatePicker
                value={intake.next_step_due ? dayjs(intake.next_step_due) : null}
                onChange={(d) =>
                  onPatchIntake({
                    next_step_due: d && d.isValid() ? d.format("YYYY-MM-DD") : null,
                  })
                }
                slotProps={{ textField: { size: "small", fullWidth: true } }}
              />
            </LabeledField>
          </Grid>
          <Grid item xs={12} md={4}>
            <LabeledField label="Blocker (if any)">
              <TextField
                size="small"
                fullWidth
                placeholder="e.g. waiting on IEP from Clayton"
                value={blocker}
                onChange={(e) => setBlocker(e.target.value)}
                onBlur={() => {
                  if (blocker !== (intake.blocker ?? "")) {
                    onPatchIntake({ blocker: blocker || null });
                  }
                }}
              />
            </LabeledField>
          </Grid>

          {resultMessage && (
            <Grid item xs={12}>
              <Alert
                severity="success"
                onClose={() => setResultMessage(null)}
                variant="outlined"
              >
                {resultMessage}
              </Alert>
            </Grid>
          )}

          {alreadyConverted && (
            <Grid item xs={12}>
              <Alert severity="info" variant="outlined">
                This intake has already been converted to an engagement.
              </Alert>
            </Grid>
          )}

          <Grid item xs={12}>
            <Stack direction="row" justifyContent="flex-end" sx={{ mt: 1 }}>
              <Tooltip title={primaryHint} disableHoverListener={!primaryDisabled}>
                <span>
                  <Button
                    variant="contained"
                    disabled={primaryDisabled || converting}
                    onClick={handlePrimary}
                  >
                    {converting ? "Working…" : primaryLabel}
                  </Button>
                </span>
              </Tooltip>
            </Stack>
          </Grid>
        </Grid>
      </CardContent>

      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Create {candidateCount} engagements?</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 1 }}>
            About to create one engagement per candidate student. Each will
            inherit this intake's discovery context.
          </DialogContentText>
          <Stack spacing={0.75} sx={{ mt: 1 }}>
            {candidates.map((c) => (
              <Box
                key={c.id}
                sx={{
                  px: 1.5,
                  py: 1,
                  border: 1,
                  borderColor: "divider",
                  borderRadius: 1,
                }}
              >
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {c.name}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {c.recommended_engagement_type
                    ? engagementTypeLabel(c.recommended_engagement_type, engagementTypes)
                    : "(no type set)"}
                </Typography>
              </Box>
            ))}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={fireConvert} disabled={converting}>
            Create {candidateCount} engagements
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
}

function engagementTypeLabel(
  code: string,
  options: EngagementTypeOption[],
): string {
  return options.find((o) => o.code === code)?.label ?? code;
}

function StudentCandidacyRow({
  student,
  engagementTypes,
  onChange,
}: {
  student: IntakeStudent;
  engagementTypes: EngagementTypeOption[];
  onChange: (body: Partial<IntakeStudent>) => void;
}) {
  const collidingActive = student.candidate
    ? student.existing_engagements.find(
        (e) => e.engagement_type === student.recommended_engagement_type,
      )
    : undefined;
  return (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      spacing={2}
      alignItems={{ xs: "stretch", sm: "flex-start" }}
      sx={{
        p: 1.5,
        border: 1,
        borderColor: "divider",
        borderRadius: 1,
        bgcolor: student.candidate ? "action.hover" : "transparent",
      }}
    >
      <FormControlLabel
        control={
          <Switch
            checked={student.candidate}
            onChange={(e) => onChange({ candidate: e.target.checked })}
          />
        }
        label={
          <Stack spacing={0.5}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {student.name}
            </Typography>
            {student.existing_engagements.length > 0 && (
              <Typography variant="caption" color="text.secondary">
                {student.existing_engagements
                  .map((e) => `${e.engagement_type} · ${e.status}`)
                  .join(" · ")}
              </Typography>
            )}
          </Stack>
        }
        sx={{ minWidth: 240, alignItems: "flex-start", mt: 0.5 }}
      />
      <Box sx={{ flex: 1 }}>
        <LabeledField label="Recommended engagement type">
          <TextField
            select
            size="small"
            fullWidth
            disabled={!student.candidate}
            value={student.recommended_engagement_type ?? ""}
            onChange={(e) =>
              onChange({
                recommended_engagement_type: e.target.value || null,
              })
            }
            SelectProps={{ displayEmpty: true }}
          >
            <MenuItem value="">
              <em>— Not set —</em>
            </MenuItem>
            {engagementTypes.map((t) => (
              <MenuItem key={t.code} value={t.code}>
                {t.label}
              </MenuItem>
            ))}
          </TextField>
        </LabeledField>
        {collidingActive && (
          <Typography
            variant="caption"
            color="warning.main"
            sx={{ display: "block", mt: 0.5 }}
          >
            Already has an active {collidingActive.engagement_type} engagement —
            convert will fail unless you pick a different type.
          </Typography>
        )}
      </Box>
    </Stack>
  );
}
