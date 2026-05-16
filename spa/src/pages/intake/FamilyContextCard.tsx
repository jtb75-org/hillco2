import { useEffect, useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  Grid,
  IconButton,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

import { LabeledField } from "../../components/LabeledField";
import { RichTextEditor } from "../../components/RichTextEditor";
import { ParentDrawer, type ParentDrawerTarget } from "../families/ParentDrawer";
import { useQueryClient } from "@tanstack/react-query";

import type { DecisionMaker, IntakeDetail, IntakeGuardian } from "./intakeTypes";

/** Family Context card — the family-scoped half of discovery: who's
 *  involved, what they want, what their constraints are. */
export function FamilyContextCard({
  intake,
  guardians,
  onPatch,
}: {
  intake: IntakeDetail;
  guardians: IntakeGuardian[];
  onPatch: (body: Partial<IntakeDetail>) => void;
}) {
  const qc = useQueryClient();
  const [drawerTarget, setDrawerTarget] = useState<ParentDrawerTarget | null>(null);

  const openPersonDrawer = (personId: string) => {
    const guardian = guardians.find((g) => g.id === personId);
    if (guardian) setDrawerTarget(guardian);
  };

  const refreshIntake = () => {
    qc.invalidateQueries({ queryKey: ["intakes", intake.id] });
    qc.invalidateQueries({ queryKey: ["families"] });
  };

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={0.25} sx={{ mb: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Family context
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Who, why, and the constraints.
          </Typography>
        </Stack>

        <Box sx={{ mb: 2 }}>
          <DecisionMakersAccordion
            people={intake.decision_makers}
            guardians={guardians}
            onChange={(next) => onPatch({ decision_makers: next })}
            onOpenPerson={openPersonDrawer}
          />
        </Box>

        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <LabeledField label="Desired outcome (in parents' words)">
              <DebouncedTextField
                multiline
                minRows={3}
                placeholder="A school where Peter feels seen…"
                value={intake.desired_outcome ?? ""}
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
                control={
                  <Switch
                    checked={intake.consent_granted === true}
                    onChange={(e) =>
                      onPatch({ consent_granted: e.target.checked })
                    }
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
      </CardContent>

      <ParentDrawer
        open={!!drawerTarget}
        parent={drawerTarget}
        onClose={() => setDrawerTarget(null)}
        onChanged={refreshIntake}
        onRemoved={() => {
          // Drop the decision_makers entry if the person was deleted
          // upstream — they're gone from the family, so the link is
          // stale.
          if (drawerTarget) {
            const next = intake.decision_makers.filter(
              (dm) => dm.person_id !== drawerTarget.id,
            );
            if (next.length !== intake.decision_makers.length) {
              onPatch({ decision_makers: next });
            }
          }
          setDrawerTarget(null);
          refreshIntake();
        }}
      />
    </Card>
  );
}

// ---- Decision-makers accordion --------------------------------------------

function DecisionMakersAccordion({
  people,
  guardians,
  onChange,
  onOpenPerson,
}: {
  people: DecisionMaker[];
  guardians: IntakeGuardian[];
  onChange: (next: DecisionMaker[]) => void;
  onOpenPerson: (personId: string) => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  return (
    <Accordion variant="outlined" disableGutters defaultExpanded>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ width: "100%" }}>
          <Typography variant="overline" color="text.secondary" sx={{ flex: 1 }}>
            Decision-makers
            <Box
              component="span"
              sx={{ ml: 1, color: "text.disabled", fontWeight: 400 }}
            >
              ({people.length})
            </Box>
          </Typography>
          <Box
            role="button"
            onClick={(e) => {
              e.stopPropagation();
              setAddOpen(true);
            }}
            sx={{
              display: "inline-flex",
              alignItems: "center",
              gap: 0.5,
              fontSize: 13,
              color: "primary.main",
              cursor: "pointer",
              px: 1,
              py: 0.25,
              borderRadius: 1,
              "&:hover": { bgcolor: "action.hover" },
            }}
          >
            <AddIcon fontSize="small" />
            Add decision-maker
          </Box>
        </Stack>
      </AccordionSummary>
      <AccordionDetails>
        {people.length === 0 ? (
          <Typography variant="body2" color="text.disabled">
            No decision-makers captured yet.
          </Typography>
        ) : (
          <Stack direction="row" useFlexGap flexWrap="wrap" sx={{ gap: 2 }}>
            {people.map((p, i) => (
              <Box key={`${p.person_id ?? "free"}-${i}`} sx={{ flex: "1 1 260px", maxWidth: 360 }}>
                <DecisionMakerCard
                  person={p}
                  onOpen={
                    p.person_id ? () => onOpenPerson(p.person_id!) : undefined
                  }
                  onRemove={() =>
                    onChange(people.filter((_, idx) => idx !== i))
                  }
                />
              </Box>
            ))}
          </Stack>
        )}
        <AddDecisionMakerDialog
          open={addOpen}
          guardians={guardians}
          existing={people}
          onClose={() => setAddOpen(false)}
          onSubmit={(dm) => {
            onChange([...people, dm]);
            setAddOpen(false);
          }}
        />
      </AccordionDetails>
    </Accordion>
  );
}

function DecisionMakerCard({
  person,
  onOpen,
  onRemove,
}: {
  person: DecisionMaker;
  /** Set only when the decision-maker is linked to a person row;
   *  free-text entries don't have anything to drill into. */
  onOpen?: () => void;
  onRemove: () => void;
}) {
  const clickable = !!onOpen;
  return (
    <Card
      variant="outlined"
      sx={{
        height: "100%",
        position: "relative",
        cursor: clickable ? "pointer" : "default",
        transition: (t) => t.transitions.create(["border-color", "background-color"]),
        "&:hover": clickable
          ? { borderColor: "primary.light", bgcolor: "action.hover" }
          : undefined,
      }}
      onClick={clickable ? onOpen : undefined}
    >
      <IconButton
        size="small"
        aria-label="Remove decision-maker"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        sx={{
          position: "absolute",
          top: 4,
          right: 4,
          zIndex: 1,
          color: "text.disabled",
          "&:hover": { color: "error.main" },
        }}
      >
        <CloseIcon fontSize="small" />
      </IconButton>
      <CardContent>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, pr: 4 }}>
          {person.name}
        </Typography>
        {person.relation && (
          <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
            {person.relation}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}

function AddDecisionMakerDialog({
  open,
  guardians,
  existing,
  onClose,
  onSubmit,
}: {
  open: boolean;
  guardians: IntakeGuardian[];
  existing: DecisionMaker[];
  onClose: () => void;
  onSubmit: (dm: DecisionMaker) => void;
}) {
  const [pickerValue, setPickerValue] = useState<string>(""); // "" = free-text, otherwise guardian.id
  const [name, setName] = useState("");
  const [relation, setRelation] = useState("");

  // Hide guardians who are already represented as decision-makers via
  // person_id — keeps the list from getting weird.
  const usedIds = new Set(
    existing.map((d) => d.person_id).filter((x): x is string => !!x),
  );
  const availableGuardians = guardians.filter((g) => !usedIds.has(g.id));

  const reset = () => {
    setPickerValue("");
    setName("");
    setRelation("");
  };

  const handleSubmit = () => {
    if (pickerValue) {
      const g = guardians.find((x) => x.id === pickerValue);
      if (!g) return;
      onSubmit({
        person_id: g.id,
        name: g.name,
        relation: relation || g.role || "",
      });
    } else {
      if (!name.trim()) return;
      onSubmit({ name: name.trim(), relation: relation.trim() });
    }
    reset();
  };

  return (
    <Dialog
      open={open}
      onClose={() => {
        onClose();
        reset();
      }}
      maxWidth="xs"
      fullWidth
    >
      <DialogTitle>Add decision-maker</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 0.5 }}>
          {availableGuardians.length > 0 && (
            <LabeledField label="From this family's guardians">
              <TextField
                select
                size="small"
                fullWidth
                value={pickerValue}
                onChange={(e) => {
                  setPickerValue(e.target.value);
                  const g = guardians.find((x) => x.id === e.target.value);
                  if (g) setName(g.name);
                }}
                SelectProps={{ displayEmpty: true }}
              >
                <MenuItem value="">
                  <em>— Free text below —</em>
                </MenuItem>
                {availableGuardians.map((g) => (
                  <MenuItem key={g.id} value={g.id}>
                    {g.name}
                  </MenuItem>
                ))}
              </TextField>
            </LabeledField>
          )}
          <LabeledField label="Name" required>
            <TextField
              size="small"
              fullWidth
              autoFocus
              disabled={!!pickerValue}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </LabeledField>
          <LabeledField label="Relation">
            <TextField
              size="small"
              fullWidth
              placeholder="Mom / Dad / Grandparent / etc."
              value={relation}
              onChange={(e) => setRelation(e.target.value)}
            />
          </LabeledField>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button
          onClick={() => {
            onClose();
            reset();
          }}
        >
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={!pickerValue && !name.trim()}
        >
          Add
        </Button>
      </DialogActions>
    </Dialog>
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
}: {
  value: string;
  placeholder?: string;
  multiline?: boolean;
  minRows?: number;
  onCommit: (v: string) => void;
}) {
  const [local, setLocal] = useState(value);
  // Sync from parent when refetch lands new data — but don't clobber
  // the user mid-edit. The blur handler is the only thing that pushes
  // local → parent, so we just re-sync on every parent change.
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
