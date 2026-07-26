import { useEffect, useState } from "react";
import {
  Box,
  Chip,
  Divider,
  FormControlLabel,
  Grid,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";

import { LabeledField } from "../../components/LabeledField";
import { RichTextEditor } from "../../components/RichTextEditor";
import { SectionPanel } from "../../components/SectionPanel";

import type { IntakeDetail } from "./intakeTypes";

/** Family Context card — the family-scoped half of discovery: desired
 *  outcome, constraints, consent, and free-form notes. "Who's involved"
 *  is captured below this card via the Family Guardians + Students
 *  selection sections. */
export function FamilyContextCard({
  intake,
  onPatch,
}: {
  intake: IntakeDetail;
  onPatch: (body: Partial<IntakeDetail>) => void;
}) {
  return (
    <SectionPanel
      title="Family context"
      subtitle="What the family wants and what's in the way."
    >
      <Box sx={{ p: 2.5 }}>
        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <LabeledField label="Desired outcome (in parents' words)">
              <DebouncedTextField
                multiline
                minRows={3}
                placeholder="A school where Peter feels seen…"
                value={intake.desired_outcome ?? ""}
                inputProps={{ "data-testid": "intake-desired-outcome" } as Record<string, string>}
                onCommit={(v) => onPatch({ desired_outcome: v || null })}
              />
            </LabeledField>
          </Grid>
          <Grid item xs={12} md={6}>
            <LabeledField label="Constraints (commute, budget, schedule)">
              <ChipInput
                value={intake.constraints}
                onChange={(next) => onPatch({ constraints: next })}
                placeholder="Add a constraint…"
              />
            </LabeledField>
          </Grid>

          <Grid item xs={12}>
            <Divider sx={{ my: 1 }} />
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={2}
              alignItems={{ sm: "center" }}
              justifyContent="space-between"
            >
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  Consent to retain education + health information
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Verbal consent obtained at start of meeting; signed release to follow.
                </Typography>
              </Box>
              <FormControlLabel
                data-testid="intake-consent-control"
                control={
                  <Switch
                    checked={intake.consent_granted === true}
                    onChange={(e) =>
                      onPatch({ consent_granted: e.target.checked })
                    }
                    inputProps={{ "data-testid": "intake-consent-toggle" } as Record<string, string>}
                  />
                }
                label={
                  intake.consent_granted === true
                    ? "Granted"
                    : intake.consent_granted === false
                      ? "Denied"
                      : "Not asked"
                }
              />
            </Stack>
          </Grid>

          <Grid item xs={12}>
            <LabeledField label="Additional family notes">
              <DebouncedRichText
                initial={intake.family_context_notes ?? ""}
                placeholder="Free-form context that doesn't fit above."
                onCommit={(html) => onPatch({ family_context_notes: html || null })}
                minRows={3}
              />
            </LabeledField>
          </Grid>
        </Grid>
      </Box>
    </SectionPanel>
  );
}

// ---- Reusable inputs -------------------------------------------------------

/** Local-state text input that commits on blur. Avoids a PATCH per
 *  keystroke. */
function DebouncedTextField({
  value,
  placeholder,
  multiline,
  minRows,
  onCommit,
  inputProps,
}: {
  value: string;
  placeholder?: string;
  multiline?: boolean;
  minRows?: number;
  onCommit: (v: string) => void;
  inputProps?: Record<string, string>;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => {
    setLocal(value);
  }, [value]);
  return (
    <TextField
      fullWidth
      size="small"
      multiline={multiline}
      minRows={minRows}
      placeholder={placeholder}
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      inputProps={inputProps}
      onBlur={() => {
        if (local !== value) onCommit(local);
      }}
    />
  );
}

/** Wrapper around RichTextEditor that commits HTML on blur. */
function DebouncedRichText({
  initial,
  placeholder,
  minRows,
  onCommit,
}: {
  initial: string;
  placeholder?: string;
  minRows?: number;
  onCommit: (html: string) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <Box
      sx={{ display: "flex" }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          if (value !== initial) onCommit(value);
        }
      }}
    >
      <RichTextEditor
        value={value}
        onChange={setValue}
        placeholder={placeholder}
        minRows={minRows}
      />
    </Box>
  );
}

/** Chip input — press Enter to commit, × to remove. */
function ChipInput({
  value,
  onChange,
  placeholder,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");
  return (
    <Box
      sx={{
        border: 1,
        borderColor: "divider",
        borderRadius: 1,
        p: 0.75,
        display: "flex",
        flexWrap: "wrap",
        gap: 0.5,
        minHeight: 40,
      }}
    >
      {value.map((v, i) => (
        <Chip
          key={`${v}-${i}`}
          label={v}
          size="small"
          onDelete={() => onChange(value.filter((_, idx) => idx !== i))}
        />
      ))}
      <TextField
        variant="standard"
        InputProps={{ disableUnderline: true }}
        size="small"
        placeholder={placeholder}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && draft.trim()) {
            e.preventDefault();
            onChange([...value, draft.trim()]);
            setDraft("");
          }
        }}
        sx={{ flex: 1, minWidth: 120, ml: 0.5 }}
      />
    </Box>
  );
}
