import { useEffect, useState } from "react";
import {
  Box,
  Button,
  Divider,
  Grid,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import LaunchIcon from "@mui/icons-material/Launch";
import { Link as RouterLink } from "react-router-dom";

import { LabeledField } from "../../components/LabeledField";
import { SectionPanel } from "../../components/SectionPanel";

import type {
  EngagementTypeOption,
  IntakeDetail,
  IntakeStudent,
  Outcome,
} from "./intakeTypes";
import { OUTCOME_LABEL } from "./intakeTypes";

/** Fit, outcome & next steps card. Per student, the consultant picks an
 *  engagement type and clicks Create to spawn that engagement (one per
 *  student, created independently). Once created, the row shows a link to
 *  the engagement; deleting the engagement re-enables the button. The
 *  outcome enum below is only for the non-convert dispositions
 *  (Deferred / Declined / …) — conversion is the per-student action. */
export function FitOutcomeCard({
  intake,
  engagementTypes,
  onPatchIntake,
  onPatchStudent,
  onCreateEngagement,
}: {
  intake: IntakeDetail;
  engagementTypes: EngagementTypeOption[];
  onPatchIntake: (body: Partial<IntakeDetail>) => void;
  onPatchStudent: (personId: string, body: Partial<IntakeStudent>) => void;
  onCreateEngagement: (personId: string, engagementType: string) => Promise<void>;
}) {
  const [creatingId, setCreatingId] = useState<string | null>(null);

  // Local mirror for the disposition textarea — PATCH-on-blur to avoid
  // a write per keystroke. The other fields all PATCH on change.
  const [reason, setReason] = useState(intake.disposition_reason ?? "");
  useEffect(() => setReason(intake.disposition_reason ?? ""), [intake.disposition_reason]);

  const handleCreate = async (personId: string, type: string) => {
    setCreatingId(personId);
    try {
      await onCreateEngagement(personId, type);
    } finally {
      setCreatingId(null);
    }
  };

  return (
    <SectionPanel
      title="Fit, outcome & next steps"
      subtitle="The decision point at the end of intake."
    >
      <Box sx={{ p: 2.5 }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
          Engagements
        </Typography>
        {intake.students.length === 0 ? (
          <Typography variant="body2" color="text.disabled" sx={{ mb: 2 }}>
            Add a student to this intake before creating an engagement.
          </Typography>
        ) : (
          <Stack spacing={1.5} sx={{ mb: 2 }}>
            {intake.students.map((s) => (
              <StudentEngagementRow
                key={s.id}
                student={s}
                engagementTypes={engagementTypes}
                creating={creatingId === s.id}
                busy={creatingId !== null}
                onTypeChange={(type) =>
                  onPatchStudent(s.id, { recommended_engagement_type: type })
                }
                onCreate={(type) => handleCreate(s.id, type)}
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
                data-testid="intake-outcome-select"
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
                {(Object.keys(OUTCOME_LABEL) as Array<keyof typeof OUTCOME_LABEL>).map(
                  (o) => (
                    <MenuItem key={o} value={o}>
                      {OUTCOME_LABEL[o]}
                    </MenuItem>
                  ),
                )}
              </TextField>
            </LabeledField>
          </Grid>
          <Grid item xs={12} md={6}>
            <LabeledField label="Disposition reason / context">
              <TextField
                multiline
                minRows={2}
                fullWidth
                placeholder="Free text — useful for declined / deferred outcomes."
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
        </Grid>
      </Box>
    </SectionPanel>
  );
}

function StudentEngagementRow({
  student,
  engagementTypes,
  creating,
  busy,
  onTypeChange,
  onCreate,
}: {
  student: IntakeStudent;
  engagementTypes: EngagementTypeOption[];
  creating: boolean;
  busy: boolean;
  onTypeChange: (type: string | null) => void;
  onCreate: (type: string) => void;
}) {
  const created = student.intake_engagement;

  // Local mirror of the chosen type (persisted via onTypeChange) so the
  // dropdown stays responsive. Seeded from recommended_engagement_type,
  // which the row remembers even after an engagement is deleted.
  const [type, setType] = useState(student.recommended_engagement_type ?? "");
  useEffect(
    () => setType(student.recommended_engagement_type ?? ""),
    [student.recommended_engagement_type],
  );

  // A pre-existing active engagement of the chosen type (not from this
  // intake) would trip the duplicate guard — block the button and say so.
  const colliding =
    type && !created
      ? student.existing_engagements.find((e) => e.engagement_type === type)
      : undefined;

  return (
    <Stack
      data-testid={`intake-engagement-row-${student.id}`}
      direction={{ xs: "column", sm: "row" }}
      spacing={2}
      alignItems={{ xs: "stretch", sm: "flex-start" }}
      sx={{
        p: 1.5,
        border: 1,
        borderColor: "divider",
        borderRadius: 1,
        bgcolor: created ? "action.hover" : "transparent",
      }}
    >
      <Box sx={{ minWidth: 240, pt: 0.5 }}>
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
      </Box>

      {created ? (
        <Box sx={{ flex: 1 }}>
          <LabeledField label="Engagement">
            <Stack direction="row" spacing={1} alignItems="center" sx={{ pt: 0.5 }}>
              <Typography variant="body2">
                {engagementTypeLabel(created.engagement_type, engagementTypes)}
              </Typography>
              <Button
                component={RouterLink}
                to={`/engagements/${created.id}`}
                size="small"
                endIcon={<LaunchIcon />}
                data-testid={`intake-engagement-link-${student.id}`}
              >
                View engagement
              </Button>
            </Stack>
          </LabeledField>
        </Box>
      ) : (
        <>
          <Box sx={{ flex: 1 }}>
            <LabeledField label="Engagement type">
              <TextField
                select
                size="small"
                fullWidth
                value={type}
                data-testid={`intake-engagement-type-${student.id}`}
                onChange={(e) => {
                  const v = e.target.value;
                  setType(v);
                  onTypeChange(v || null);
                }}
                SelectProps={{ displayEmpty: true }}
              >
                <MenuItem value="">
                  <em>— No engagement —</em>
                </MenuItem>
                {engagementTypes.map((t) => (
                  <MenuItem key={t.code} value={t.code}>
                    {t.label}
                  </MenuItem>
                ))}
              </TextField>
            </LabeledField>
            {colliding && (
              <Typography
                variant="caption"
                color="warning.main"
                sx={{ display: "block", mt: 0.5 }}
              >
                Already has an active {colliding.engagement_type} engagement —
                pick a different type.
              </Typography>
            )}
          </Box>
          <Box sx={{ pt: { sm: 3.25 } }}>
            <Button
              variant="contained"
              size="small"
              disabled={!type || !!colliding || busy}
              onClick={() => onCreate(type)}
              data-testid={`intake-create-engagement-${student.id}`}
            >
              {creating ? "Creating…" : "Create engagement"}
            </Button>
          </Box>
        </>
      )}
    </Stack>
  );
}

function engagementTypeLabel(
  code: string,
  options: EngagementTypeOption[],
): string {
  return options.find((o) => o.code === code)?.label ?? code;
}
