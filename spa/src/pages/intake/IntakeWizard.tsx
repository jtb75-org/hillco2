import { useState } from "react";
import {
  Alert,
  Box,
  Breadcrumbs,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Link as MuiLink,
  Paper,
  Stack,
  Step,
  StepLabel,
  Stepper,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link as RouterLink, useNavigate } from "react-router-dom";

import { api } from "../../api/client";
import type { components } from "../../api/schema";
import { LabeledField } from "../../components/LabeledField";
import { PersonSearchField } from "../../components/PersonSearchField";

type ParentCreate = components["schemas"]["ParentCreate"];

// The wizard runs through 5 phases. The first PR ships #1 and #2
// fully wired; #3-#5 render a placeholder for now.
const STEPS = [
  "Family",
  "Guardians",
  "Student",
  "At a glance",
  "Done",
];

// Per-step commits land in the wizard's local state. The wizard never
// keeps form data in memory past a step transition — each Next click
// has already POSTed/PATCHed the underlying record, so refreshing or
// abandoning the wizard preserves whatever's been entered.
interface WizardState {
  familyId: string | null;
  familyName: string | null;
  guardianIds: string[];
}

export function IntakeWizard() {
  const [step, setStep] = useState(0);
  const [state, setState] = useState<WizardState>({
    familyId: null,
    familyName: null,
    guardianIds: [],
  });

  return (
    <Stack spacing={3}>
      <Breadcrumbs>
        <MuiLink component={RouterLink} to="/" color="inherit" underline="hover">
          Home
        </MuiLink>
        <Typography color="text.primary">New client intake</Typography>
      </Breadcrumbs>

      <Typography variant="h4">New client intake</Typography>

      <Stepper activeStep={step} alternativeLabel>
        {STEPS.map((label) => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      <Paper variant="outlined" sx={{ p: 3 }}>
        {step === 0 && (
          <FamilyStep
            initialFamilyId={state.familyId}
            onCommit={(id, name) => {
              setState((s) => ({ ...s, familyId: id, familyName: name }));
              setStep(1);
            }}
          />
        )}
        {step === 1 && state.familyId && state.familyName && (
          <GuardiansStep
            familyId={state.familyId}
            familyName={state.familyName}
            onBack={() => setStep(0)}
            onContinue={() => setStep(2)}
          />
        )}
        {step >= 2 && (
          <ComingSoon
            label={STEPS[step]}
            onBack={() => setStep(step - 1)}
            familyId={state.familyId}
          />
        )}
      </Paper>
    </Stack>
  );
}

// ---- Step 1: Family --------------------------------------------------------

interface FamilyRow {
  id: string;
  household_name: string;
  primary_parent_name: string | null;
  student_count: number;
}

function FamilyStep({
  initialFamilyId,
  onCommit,
}: {
  initialFamilyId: string | null;
  onCommit: (familyId: string, householdName: string) => void;
}) {
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [existingId, setExistingId] = useState<string | null>(initialFamilyId);
  const [existingName, setExistingName] = useState<string | null>(null);
  const [householdName, setHouseholdName] = useState("");
  const [notes, setNotes] = useState("");

  const families = useQuery<FamilyRow[], Error>({
    queryKey: ["families", "list-all"],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/families");
      if (error || !data) throw new Error("Failed to load families.");
      return data as unknown as FamilyRow[];
    },
    staleTime: 60_000,
  });

  const create = useMutation({
    mutationFn: async (): Promise<{ id: string; household_name: string }> => {
      const { data, error: respError } = await api.POST("/api/families", {
        body: { household_name: householdName.trim(), notes: notes.trim() || null },
      });
      if (respError || !data) {
        const msg =
          (respError as { detail?: string } | undefined)?.detail ??
          "Failed to create family.";
        throw new Error(msg);
      }
      return data as unknown as { id: string; household_name: string };
    },
    onSuccess: (row) => onCommit(row.id, row.household_name),
  });

  const handleContinue = () => {
    if (mode === "existing" && existingId && existingName) {
      onCommit(existingId, existingName);
    } else if (mode === "new" && householdName.trim()) {
      create.mutate();
    }
  };

  const continueDisabled =
    create.isPending ||
    (mode === "existing" && !existingId) ||
    (mode === "new" && !householdName.trim());

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="overline" color="text.secondary">
          Step 1
        </Typography>
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          Family
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Pick an existing household or create a new one. The rest of the
          wizard attaches under this family.
        </Typography>
      </Box>

      <ToggleButtonGroup
        value={mode}
        exclusive
        onChange={(_, v) => v && setMode(v)}
        size="small"
      >
        <ToggleButton value="existing">Existing family</ToggleButton>
        <ToggleButton value="new">New family</ToggleButton>
      </ToggleButtonGroup>

      {mode === "existing" ? (
        <LabeledField label="Family">
          <TextField
            select
            SelectProps={{ native: true }}
            value={existingId ?? ""}
            onChange={(e) => {
              const id = e.target.value || null;
              setExistingId(id);
              setExistingName(
                (families.data ?? []).find((f) => f.id === id)?.household_name ?? null,
              );
            }}
            fullWidth
            disabled={families.isPending}
          >
            <option value="">— select a family —</option>
            {(families.data ?? []).map((f) => (
              <option key={f.id} value={f.id}>
                {f.household_name}
                {f.primary_parent_name ? ` · ${f.primary_parent_name}` : ""}
                {f.student_count > 0 ? ` · ${f.student_count} student${f.student_count === 1 ? "" : "s"}` : ""}
              </option>
            ))}
          </TextField>
        </LabeledField>
      ) : (
        <Stack spacing={2}>
          <LabeledField label="Household name" required>
            <TextField
              autoFocus
              required
              placeholder='e.g. "Smith" or "Jones-Wilson"'
              value={householdName}
              onChange={(e) => setHouseholdName(e.target.value)}
              fullWidth
              inputProps={{ maxLength: 200 }}
            />
          </LabeledField>
          <LabeledField label="Notes" helperText="Optional. Anything to remember about this family.">
            <TextField
              multiline
              minRows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              fullWidth
            />
          </LabeledField>
        </Stack>
      )}

      {create.error && <Alert severity="error">{create.error.message}</Alert>}

      <Divider />
      <Stack direction="row" justifyContent="flex-end">
        <Button
          variant="contained"
          onClick={handleContinue}
          disabled={continueDisabled}
        >
          {create.isPending ? "Saving…" : "Continue"}
        </Button>
      </Stack>
    </Stack>
  );
}

// ---- Step 2: Guardians -----------------------------------------------------

interface FamilyParent {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string;
  is_primary_contact: boolean;
  is_billing_contact: boolean;
}

function GuardiansStep({
  familyId,
  familyName,
  onBack,
  onContinue,
}: {
  familyId: string;
  familyName: string;
  onBack: () => void;
  onContinue: () => void;
}) {
  const qc = useQueryClient();
  const family = useQuery({
    queryKey: ["families", familyId, "wizard"],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/families/{family_id}", {
        params: { path: { family_id: familyId } },
      });
      if (error || !data) throw new Error("Failed to load family.");
      return data as unknown as { parents: FamilyParent[] };
    },
  });
  const parents = family.data?.parents ?? [];
  const [adding, setAdding] = useState(parents.length === 0);

  const onAdded = () => {
    setAdding(false);
    qc.invalidateQueries({ queryKey: ["families", familyId, "wizard"] });
  };

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="overline" color="text.secondary">
          Step 2
        </Typography>
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          Guardians for {familyName}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Add the parents / guardians attached to this family. You can fill
          in email, address, and the rest from the family page after the
          wizard finishes.
        </Typography>
      </Box>

      {family.isPending ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
          <CircularProgress size={28} />
        </Box>
      ) : (
        <Stack spacing={1.5}>
          {parents.map((p) => (
            <Paper key={p.id} variant="outlined" sx={{ p: 2 }}>
              <Stack direction="row" alignItems="center" spacing={1}>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                    {p.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {p.role}
                  </Typography>
                </Box>
                {p.is_primary_contact && (
                  <Chip size="small" label="primary" color="primary" variant="outlined" />
                )}
                {p.is_billing_contact && (
                  <Chip size="small" label="billing" color="success" variant="outlined" />
                )}
              </Stack>
            </Paper>
          ))}

          {adding ? (
            <AddGuardianInline
              familyId={familyId}
              onAdded={onAdded}
              onCancel={() => setAdding(false)}
            />
          ) : (
            <Button
              variant="outlined"
              onClick={() => setAdding(true)}
              sx={{ alignSelf: "flex-start" }}
            >
              + Add a guardian
            </Button>
          )}
        </Stack>
      )}

      <Divider />
      <Stack direction="row" justifyContent="space-between">
        <Button onClick={onBack}>Back</Button>
        <Button
          variant="contained"
          onClick={onContinue}
          disabled={parents.length === 0 || adding}
        >
          Continue
        </Button>
      </Stack>
    </Stack>
  );
}

function AddGuardianInline({
  familyId,
  onAdded,
  onCancel,
}: {
  familyId: string;
  onAdded: () => void;
  onCancel: () => void;
}) {
  const [picked, setPicked] = useState<{
    kind: "existing";
    personId: string;
    label: string;
  } | {
    kind: "creating";
    firstName: string;
    lastName: string;
  } | null>(null);

  const create = useMutation({
    mutationFn: async () => {
      if (!picked) throw new Error("nothing to add");
      const body: ParentCreate =
        picked.kind === "existing"
          ? {
              person_id: picked.personId,
              role: "other",
              is_primary_contact: false,
              is_billing_contact: false,
            }
          : {
              first_name: picked.firstName.trim(),
              last_name: picked.lastName.trim() || null,
              role: "other",
              is_primary_contact: false,
              is_billing_contact: false,
            };
      const { error: respError } = await api.POST(
        "/api/families/{family_id}/parents",
        { params: { path: { family_id: familyId } }, body },
      );
      if (respError) {
        const msg =
          (respError as { detail?: string } | undefined)?.detail ??
          "Failed to add guardian.";
        throw new Error(msg);
      }
    },
    onSuccess: onAdded,
  });

  const submitDisabled =
    create.isPending ||
    !picked ||
    (picked.kind === "creating" && (!picked.firstName.trim() || !picked.lastName.trim()));

  return (
    <Paper variant="outlined" sx={{ p: 2, borderStyle: "dashed" }}>
      <Stack spacing={2}>
        {!picked && (
          <LabeledField
            label="Search or add"
            helperText="Search the address book, or type a new name and pick &quot;Add new&quot;."
          >
            <PersonSearchField
              autoFocus
              onPickExisting={(person) =>
                setPicked({
                  kind: "existing",
                  personId: person.id,
                  label: `${person.first_name}${person.last_name ? " " + person.last_name : ""}`.trim(),
                })
              }
              onCreateNew={(typed) => {
                const trimmed = typed.trim();
                const idx = trimmed.indexOf(" ");
                setPicked({
                  kind: "creating",
                  firstName: idx === -1 ? trimmed : trimmed.slice(0, idx),
                  lastName: idx === -1 ? "" : trimmed.slice(idx + 1).trim(),
                });
              }}
            />
          </LabeledField>
        )}

        {picked?.kind === "existing" && (
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="body2">Linking</Typography>
            <Chip label={picked.label} onDelete={() => setPicked(null)} />
          </Stack>
        )}

        {picked?.kind === "creating" && (
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <LabeledField label="First name" required>
              <TextField
                required
                value={picked.firstName}
                onChange={(e) =>
                  setPicked({ ...picked, firstName: e.target.value })
                }
                fullWidth
                inputProps={{ maxLength: 100 }}
              />
            </LabeledField>
            <LabeledField label="Last name" required>
              <TextField
                required
                value={picked.lastName}
                onChange={(e) =>
                  setPicked({ ...picked, lastName: e.target.value })
                }
                fullWidth
                inputProps={{ maxLength: 100 }}
              />
            </LabeledField>
          </Stack>
        )}

        {create.error && <Alert severity="error">{create.error.message}</Alert>}

        <Stack direction="row" spacing={1} justifyContent="flex-end">
          <Button onClick={onCancel} disabled={create.isPending}>
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={submitDisabled}
            onClick={() => create.mutate()}
          >
            {create.isPending ? "Saving…" : "Add guardian"}
          </Button>
        </Stack>
      </Stack>
    </Paper>
  );
}

// ---- Steps 3-5: placeholders ----------------------------------------------

function ComingSoon({
  label,
  onBack,
  familyId,
}: {
  label: string;
  onBack: () => void;
  familyId: string | null;
}) {
  const navigate = useNavigate();
  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="overline" color="text.secondary">
          {label}
        </Typography>
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          Coming soon
        </Typography>
        <Typography variant="body2" color="text.secondary">
          The remaining wizard steps land in a follow-up PR. In the
          meantime you can finish setup on the family page directly.
        </Typography>
      </Box>
      <Divider />
      <Stack direction="row" justifyContent="space-between">
        <Button onClick={onBack}>Back</Button>
        {familyId && (
          <Button variant="contained" onClick={() => navigate(`/families/${familyId}`)}>
            Go to family page
          </Button>
        )}
      </Stack>
    </Stack>
  );
}
