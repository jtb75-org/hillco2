import { Box, Chip, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { DatePicker } from "@mui/x-date-pickers";
import dayjs from "dayjs";

import { LabeledField } from "../../components/LabeledField";
import { SectionPanel } from "../../components/SectionPanel";
import { ghostFieldSx } from "../../components/ghostFieldSx";

import type { Outcome, ReferralSource } from "./intakeTypes";
import { OUTCOME_STATUS_DISPLAY, REFERRAL_SOURCE_LABEL } from "./intakeTypes";

/**
 * Top strip of the new intake page: editable intake date, referral
 * source picker, and the status chip derived from outcome. The chip
 * label flips from "In progress" (no outcome set) to whatever outcome
 * the consultant picked in the Fit card. There's no standalone
 * "Mark complete" affordance — outcome IS the closure state.
 */
export function IntakeHeaderStrip({
  intakeDate,
  referralSource,
  outcome,
  onIntakeDateChange,
  onReferralSourceChange,
}: {
  intakeDate: string;
  referralSource: ReferralSource | null;
  outcome: Outcome | null;
  onIntakeDateChange: (next: string) => void;
  onReferralSourceChange: (next: ReferralSource | null) => void;
}) {
  const status =
    outcome == null
      ? { label: "In progress", color: "primary" as const }
      : OUTCOME_STATUS_DISPLAY[outcome];
  return (
    <SectionPanel>
      <Box sx={{ p: 2.5 }}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems="flex-start">
        <Box sx={{ flex: 1 }}>
          <LabeledField label="Intake date">
            <DatePicker
              value={dayjs(intakeDate)}
              onChange={(d) => {
                if (d && d.isValid()) {
                  onIntakeDateChange(d.format("YYYY-MM-DD"));
                }
              }}
              slotProps={{ textField: { size: "small", fullWidth: true } }}
            />
          </LabeledField>
        </Box>
        <Box sx={{ flex: 1 }}>
          <LabeledField label="Referral source">
            <TextField
              select
              size="small"
              fullWidth
              sx={ghostFieldSx}
              value={referralSource ?? ""}
              onChange={(e) =>
                onReferralSourceChange(
                  (e.target.value || null) as ReferralSource | null,
                )
              }
              SelectProps={{ displayEmpty: true }}
            >
              <MenuItem value="">
                <em>— Not set —</em>
              </MenuItem>
              {Object.entries(REFERRAL_SOURCE_LABEL).map(([key, label]) => (
                <MenuItem key={key} value={key}>
                  {label}
                </MenuItem>
              ))}
            </TextField>
          </LabeledField>
        </Box>
        <Box sx={{ flex: 1 }}>
          <LabeledField label="Status">
            <Stack direction="row" spacing={1} alignItems="center" sx={{ pt: 0.5 }}>
              <Chip size="small" label={status.label} color={status.color} />
              <Typography variant="caption" color="text.secondary">
                {outcome == null
                  ? "Set the outcome below to close"
                  : "Closed — change outcome to re-open"}
              </Typography>
            </Stack>
          </LabeledField>
        </Box>
      </Stack>
      </Box>
    </SectionPanel>
  );
}
