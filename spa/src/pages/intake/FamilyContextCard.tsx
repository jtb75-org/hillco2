import { useEffect, useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  createFilterOptions,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  Grid,
  IconButton,
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
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { PromoteDecisionMakerDialog } from "./PromoteDecisionMakerDialog";
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
  const [promoteTarget, setPromoteTarget] = useState<{
    index: number;
    dm: DecisionMaker;
  } | null>(null);

  const handleOpenDecisionMaker = (index: number, dm: DecisionMaker) => {
    if (dm.person_id) {
      const guardian = guardians.find((g) => g.id === dm.person_id);
      if (guardian) setDrawerTarget(guardian);
    } else {
      // Free-text entry — no person record to drill into yet.
      // Offer to promote them into a real family guardian.
      setPromoteTarget({ index, dm });
    }
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
            familyId={intake.family_id}
            people={intake.decision_makers}
            guardians={guardians}
            onChange={(next) => onPatch({ decision_makers: next })}
            onOpenDecisionMaker={handleOpenDecisionMaker}
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
      <PromoteDecisionMakerDialog
        open={!!promoteTarget}
        familyId={intake.family_id}
        intakeId={intake.id}
        decisionMaker={promoteTarget?.dm ?? null}
        decisionMakerIndex={promoteTarget?.index ?? null}
        allDecisionMakers={intake.decision_makers}
        onClose={() => setPromoteTarget(null)}
        onPromoted={({ person_id }) => {
          setPromoteTarget(null);
          refreshIntake();
          // Open the ParentDrawer for the new guardian. We optimistically
          // build a target from what we just submitted; the drawer's own
          // query refetches the structured detail.
          setDrawerTarget({
            id: person_id,
            name: promoteTarget?.dm.name ?? "",
            email: null,
            phone: null,
            role: "other",
            is_primary_contact: false,
            is_billing_contact: false,
            mailing_address: null,
            billing_address: null,
          });
        }}
      />
    </Card>
  );
}

// ---- Decision-makers accordion --------------------------------------------

function DecisionMakersAccordion({
  familyId,
  people,
  guardians,
  onChange,
  onOpenDecisionMaker,
}: {
  familyId: string;
  people: DecisionMaker[];
  guardians: IntakeGuardian[];
  onChange: (next: DecisionMaker[]) => void;
  onOpenDecisionMaker: (index: number, dm: DecisionMaker) => void;
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
                  onOpen={() => onOpenDecisionMaker(i, p)}
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
          familyId={familyId}
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
  /** Always clickable. Linked entries open the ParentDrawer; free-text
   *  entries open a promote dialog so they can become real family
   *  guardians. */
  onOpen: () => void;
  onRemove: () => void;
}) {
  return (
    <Card
      variant="outlined"
      sx={{
        height: "100%",
        position: "relative",
        cursor: "pointer",
        transition: (t) => t.transitions.create(["border-color", "background-color"]),
        "&:hover": { borderColor: "primary.light", bgcolor: "action.hover" },
      }}
      onClick={onOpen}
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

type DMEntry =
  | { kind: "guardian"; guardian: IntakeGuardian; alreadyUsed: boolean }
  | { kind: "add"; label: string };

const filterDMEntries = createFilterOptions<DMEntry>({
  stringify: (entry) =>
    entry.kind === "add"
      ? entry.label
      : [entry.guardian.name, entry.guardian.email ?? ""].join(" "),
});

function AddDecisionMakerDialog({
  open,
  familyId,
  guardians,
  existing,
  onClose,
  onSubmit,
}: {
  open: boolean;
  familyId: string;
  guardians: IntakeGuardian[];
  existing: DecisionMaker[];
  onClose: () => void;
  onSubmit: (dm: DecisionMaker) => void;
}) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<IntakeGuardian | null>(null);
  const [creating, setCreating] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [relation, setRelation] = useState("");

  // Mark already-used family guardians so the search shows them
  // (so the user doesn't think the typeahead is broken) but disables
  // the option.
  const usedIds = new Set(
    existing.map((d) => d.person_id).filter((x): x is string => !!x),
  );
  const baseOptions: DMEntry[] = guardians.map((g) => ({
    kind: "guardian",
    guardian: g,
    alreadyUsed: usedIds.has(g.id),
  }));

  const reset = () => {
    setSearch("");
    setPicked(null);
    setCreating(false);
    setFirstName("");
    setLastName("");
    setEmail("");
    setPhone("");
    setRelation("");
    createGuardian.reset();
  };

  const createGuardian = useMutation({
    mutationFn: async () => {
      const rel = relation.toLowerCase();
      const role: "mom" | "dad" | "guardian" | "other" = (() => {
        if (rel.includes("mom") || rel.includes("mother")) return "mom";
        if (rel.includes("dad") || rel.includes("father")) return "dad";
        if (rel.includes("guardian")) return "guardian";
        return "other";
      })();
      const res = await fetch(`/api/families/${familyId}/parents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          first_name: firstName.trim() || null,
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
      return (await res.json()) as { id: string };
    },
    onSuccess: (created) => {
      onSubmit({
        person_id: created.id,
        name: `${firstName.trim()} ${lastName.trim()}`.trim(),
        relation: relation.trim(),
      });
      qc.invalidateQueries({ queryKey: ["families"] });
      qc.invalidateQueries({ queryKey: ["contacts", "list"] });
      reset();
    },
  });

  const startCreating = (label: string) => {
    const trimmed = label.trim();
    if (trimmed) {
      const [first, ...rest] = trimmed.split(/\s+/);
      setFirstName(first ?? "");
      setLastName(rest.join(" "));
    }
    setPicked(null);
    setCreating(true);
  };

  const linkExisting = (g: IntakeGuardian) => {
    onSubmit({
      person_id: g.id,
      name: g.name,
      relation: relation.trim() || g.role || "",
    });
    reset();
  };

  const handleSubmit = () => {
    if (picked) linkExisting(picked);
    else if (creating) {
      if (!firstName.trim() && !lastName.trim()) return;
      createGuardian.mutate();
    }
  };

  const pending = createGuardian.isPending;
  const canSubmit =
    !pending &&
    (picked
      ? true
      : creating && (firstName.trim() !== "" || lastName.trim() !== ""));

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (pending) return;
        onClose();
        reset();
      }}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle>Add decision-maker</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {!creating && (
            <Box>
              <Typography
                variant="body2"
                sx={{ mb: 0.5, color: "text.secondary", fontWeight: 500 }}
              >
                Search existing guardians
              </Typography>
              <Autocomplete<DMEntry, false, false, false>
                size="small"
                options={baseOptions}
                value={
                  picked
                    ? { kind: "guardian", guardian: picked, alreadyUsed: false }
                    : null
                }
                inputValue={search}
                onInputChange={(_e, v, reason) => {
                  if (reason !== "reset") setSearch(v);
                }}
                onChange={(_e, entry) => {
                  if (!entry) {
                    setPicked(null);
                    return;
                  }
                  if (entry.kind === "guardian") {
                    setPicked(entry.guardian);
                    setCreating(false);
                    setSearch(entry.guardian.name);
                    return;
                  }
                  startCreating(entry.label);
                }}
                getOptionLabel={(entry) =>
                  entry.kind === "guardian" ? entry.guardian.name : entry.label
                }
                getOptionDisabled={(entry) =>
                  entry.kind === "guardian" && entry.alreadyUsed
                }
                isOptionEqualToValue={(a, b) =>
                  a.kind === "guardian" &&
                  b.kind === "guardian" &&
                  a.guardian.id === b.guardian.id
                }
                filterOptions={(opts, state) => {
                  const filtered = filterDMEntries(opts, state);
                  // Always offer "+ Add new" at the bottom — without
                  // it the dialog is dead-end whenever the family
                  // roster is empty.
                  filtered.push({ kind: "add", label: state.inputValue.trim() });
                  return filtered;
                }}
                renderOption={(props, entry) => {
                  if (entry.kind === "add") {
                    return (
                      <li {...props} key="__add__">
                        <Typography variant="body2" color="primary">
                          {entry.label
                            ? `+ Add "${entry.label}" as a new guardian`
                            : "+ Add a new guardian"}
                        </Typography>
                      </li>
                    );
                  }
                  const g = entry.guardian;
                  return (
                    <li {...props} key={g.id}>
                      <Stack spacing={0.25} sx={{ py: 0.25, width: "100%" }}>
                        <Stack
                          direction="row"
                          alignItems="center"
                          spacing={1}
                          sx={{ width: "100%" }}
                        >
                          <Box component="span" sx={{ fontWeight: 500, flex: 1 }}>
                            {g.name}
                          </Box>
                          {entry.alreadyUsed && (
                            <Chip
                              size="small"
                              label="already used"
                              variant="outlined"
                              sx={{ height: 20 }}
                            />
                          )}
                        </Stack>
                        <Box
                          component="span"
                          sx={{ color: "text.secondary", fontSize: 12 }}
                        >
                          {g.email && <span>{g.email}</span>}
                          {g.email && g.phone && <span> · </span>}
                          {g.phone && <span>{g.phone}</span>}
                        </Box>
                      </Stack>
                    </li>
                  );
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    autoFocus
                    placeholder="Name or email"
                  />
                )}
              />
            </Box>
          )}

          {creating && (
            <>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <LabeledField label="First name">
                  <TextField
                    size="small"
                    fullWidth
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                  />
                </LabeledField>
                <LabeledField label="Last name">
                  <TextField
                    size="small"
                    fullWidth
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                  />
                </LabeledField>
              </Stack>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <LabeledField label="Email">
                  <TextField
                    type="email"
                    size="small"
                    fullWidth
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </LabeledField>
                <LabeledField label="Phone">
                  <TextField
                    size="small"
                    fullWidth
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </LabeledField>
              </Stack>
            </>
          )}

          {(picked || creating) && (
            <LabeledField label="Relation">
              <TextField
                size="small"
                fullWidth
                placeholder="Mom / Dad / Grandparent / etc."
                value={relation}
                onChange={(e) => setRelation(e.target.value)}
              />
            </LabeledField>
          )}

          {picked && (
            <Typography variant="caption" color="text.secondary">
              Linking <strong>{picked.name}</strong> as a decision-maker.
              They already exist on the family — this just adds them to
              the meeting's decision-maker list.
            </Typography>
          )}

          {createGuardian.error && (
            <Alert severity="error">{createGuardian.error.message}</Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button
          onClick={() => {
            if (pending) return;
            onClose();
            reset();
          }}
          disabled={pending}
        >
          Cancel
        </Button>
        <Button variant="contained" disabled={!canSubmit} onClick={handleSubmit}>
          {pending ? "Adding…" : "Add"}
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
