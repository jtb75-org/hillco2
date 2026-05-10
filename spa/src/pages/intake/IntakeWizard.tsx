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
import { useSnackbar } from "../../components/Snackbar";

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
  studentIds: string[];
}

export function IntakeWizard() {
  const [step, setStep] = useState(0);
  const [state, setState] = useState<WizardState>({
    familyId: null,
    familyName: null,
    guardianIds: [],
    studentIds: [],
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
        {step === 2 && state.familyId && state.familyName && (
          <StudentsStep
            familyId={state.familyId}
            familyName={state.familyName}
            onBack={() => setStep(1)}
            onContinue={(ids) => {
              setState((s) => ({ ...s, studentIds: ids }));
              setStep(3);
            }}
          />
        )}
        {step === 3 && state.familyName && state.studentIds.length > 0 && (
          <AtAGlanceStep
            familyName={state.familyName}
            studentIds={state.studentIds}
            onBack={() => setStep(2)}
            onContinue={() => setStep(4)}
          />
        )}
        {step === 4 && (
          <DoneStep familyId={state.familyId} familyName={state.familyName} />
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
  const snackbar = useSnackbar();
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
    onSuccess: (row) => {
      snackbar.show(`${row.household_name} family created`);
      onCommit(row.id, row.household_name);
    },
  });

  const handleContinue = () => {
    if (mode === "existing" && existingId && existingName) {
      snackbar.show(`Continuing with ${existingName} family`, "info");
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
              familyName={familyName}
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
  familyName,
  onAdded,
  onCancel,
}: {
  familyId: string;
  familyName: string;
  onAdded: () => void;
  onCancel: () => void;
}) {
  const snackbar = useSnackbar();
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
    mutationFn: async (): Promise<string> => {
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
      // Return the display name so onSuccess can spell out the toast.
      return picked.kind === "existing"
        ? picked.label
        : `${picked.firstName.trim()}${picked.lastName.trim() ? " " + picked.lastName.trim() : ""}`;
    },
    onSuccess: (name) => {
      const verb = picked?.kind === "existing" ? "linked" : "added";
      snackbar.show(`${name} ${verb} to ${familyName} family`);
      onAdded();
    },
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

// ---- Step 3: Students ------------------------------------------------------

interface FamilyStudent {
  id: string;
  name: string;
  current_grade: string | null;
}

function StudentsStep({
  familyId,
  familyName,
  onBack,
  onContinue,
}: {
  familyId: string;
  familyName: string;
  onBack: () => void;
  onContinue: (studentIds: string[]) => void;
}) {
  const qc = useQueryClient();
  const family = useQuery({
    queryKey: ["families", familyId, "wizard-students"],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/families/{family_id}", {
        params: { path: { family_id: familyId } },
      });
      if (error || !data) throw new Error("Failed to load family.");
      return data as unknown as { students: FamilyStudent[] };
    },
  });
  const students = family.data?.students ?? [];
  const [adding, setAdding] = useState(students.length === 0);

  const onAdded = () => {
    setAdding(false);
    qc.invalidateQueries({ queryKey: ["families", familyId, "wizard-students"] });
  };

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="overline" color="text.secondary">
          Step 3
        </Typography>
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          Students in {familyName}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Add the student(s) we're working with. DOB, grade, school, and
          clinical details land on the student page; you'll set the
          high-level flags in the next step.
        </Typography>
      </Box>

      {family.isPending ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
          <CircularProgress size={28} />
        </Box>
      ) : (
        <Stack spacing={1.5}>
          {students.map((s) => (
            <Paper key={s.id} variant="outlined" sx={{ p: 2 }}>
              <Stack direction="row" alignItems="center" spacing={1}>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                    {s.name}
                  </Typography>
                  {s.current_grade && (
                    <Typography variant="caption" color="text.secondary">
                      Grade {s.current_grade}
                    </Typography>
                  )}
                </Box>
              </Stack>
            </Paper>
          ))}

          {adding ? (
            <AddStudentInline
              familyId={familyId}
              familyName={familyName}
              onAdded={onAdded}
              onCancel={() => setAdding(false)}
            />
          ) : (
            <Button
              variant="outlined"
              onClick={() => setAdding(true)}
              sx={{ alignSelf: "flex-start" }}
            >
              + Add a student
            </Button>
          )}
        </Stack>
      )}

      <Divider />
      <Stack direction="row" justifyContent="space-between">
        <Button onClick={onBack}>Back</Button>
        <Button
          variant="contained"
          onClick={() => onContinue(students.map((s) => s.id))}
          disabled={students.length === 0 || adding}
        >
          Continue
        </Button>
      </Stack>
    </Stack>
  );
}

function AddStudentInline({
  familyId,
  familyName,
  onAdded,
  onCancel,
}: {
  familyId: string;
  familyName: string;
  onAdded: () => void;
  onCancel: () => void;
}) {
  const snackbar = useSnackbar();
  const [picked, setPicked] = useState<{
    kind: "existing";
    personId: string;
    label: string;
  } | {
    kind: "creating";
    firstName: string;
    lastName: string;
    grade: string;
  } | null>(null);

  const create = useMutation({
    mutationFn: async (): Promise<string> => {
      if (!picked) throw new Error("nothing to add");
      const body =
        picked.kind === "existing"
          ? { person_id: picked.personId }
          : {
              first_name: picked.firstName.trim(),
              last_name: picked.lastName.trim() || null,
              current_grade: picked.grade.trim() || null,
            };
      const { error: respError } = await api.POST(
        "/api/families/{family_id}/students",
        { params: { path: { family_id: familyId } }, body: body as never },
      );
      if (respError) {
        const msg =
          (respError as { detail?: string } | undefined)?.detail ??
          "Failed to add student.";
        throw new Error(msg);
      }
      return picked.kind === "existing"
        ? picked.label
        : `${picked.firstName.trim()}${picked.lastName.trim() ? " " + picked.lastName.trim() : ""}`;
    },
    onSuccess: (name) => {
      const verb = picked?.kind === "existing" ? "linked" : "added";
      snackbar.show(`${name} ${verb} to ${familyName} family`);
      onAdded();
    },
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
            helperText="Search existing students, or type a new name and pick &quot;Add new&quot;."
          >
            <PersonSearchField
              autoFocus
              kind="student"
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
                  grade: "",
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
          <>
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
            <LabeledField label="Current grade">
              <TextField
                placeholder='e.g. "8th"'
                value={picked.grade}
                onChange={(e) =>
                  setPicked({ ...picked, grade: e.target.value })
                }
                fullWidth
              />
            </LabeledField>
          </>
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
            {create.isPending ? "Saving…" : "Add student"}
          </Button>
        </Stack>
      </Stack>
    </Paper>
  );
}

// ---- Step 4: At a glance ---------------------------------------------------

// Compact view of the same flags the student detail page edits — chip
// toggles only (no notes/level popovers here, so the wizard stays
// quick). Operators land on the student page for full editing.
interface StudentFlags {
  id: string;
  name: string;
  has_504: boolean;
  has_iep: boolean;
  has_learning_disability: boolean;
  has_adhd: boolean;
  has_intellectual_disability: boolean;
  has_health_impairment: boolean;
  has_emotional_disturbance: boolean;
  autism_level: 1 | 2 | 3 | null;
  diagnosis_other: string | null;
}

function AtAGlanceStep({
  familyName,
  studentIds,
  onBack,
  onContinue,
}: {
  familyName: string;
  studentIds: string[];
  onBack: () => void;
  onContinue: () => void;
}) {
  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="overline" color="text.secondary">
          Step 4
        </Typography>
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          At a glance
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Mark the flags that apply to each student. Notes, autism level,
          and "Other" details land on the student page for fuller entry —
          this step is just the quick-tick first pass.
        </Typography>
      </Box>

      <Stack spacing={3}>
        {studentIds.map((id) => (
          <StudentFlagsBlock key={id} studentId={id} familyName={familyName} />
        ))}
      </Stack>

      <Divider />
      <Stack direction="row" justifyContent="space-between">
        <Button onClick={onBack}>Back</Button>
        <Button variant="contained" onClick={onContinue}>
          Continue
        </Button>
      </Stack>
    </Stack>
  );
}

function StudentFlagsBlock({
  studentId,
  familyName,
}: {
  studentId: string;
  familyName: string;
}) {
  const qc = useQueryClient();
  const snackbar = useSnackbar();
  const { data } = useQuery<StudentFlags, Error>({
    queryKey: ["students", studentId, "flags"],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/students/{student_id}", {
        params: { path: { student_id: studentId } },
      });
      if (error || !data) throw new Error("Failed to load student.");
      return data as unknown as StudentFlags;
    },
  });

  const patch = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const { error } = await api.PATCH("/api/students/{student_id}", {
        params: { path: { student_id: studentId } },
        body: body as never,
      });
      if (error) {
        const msg = (error as { detail?: string }).detail ?? "Save failed.";
        throw new Error(msg);
      }
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["students", studentId, "flags"] }),
    onError: (e: Error) => snackbar.show(e.message, "error"),
  });

  if (!data) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
        <CircularProgress size={20} />
      </Box>
    );
  }

  // Don't mention the family on every flag click — it'd be too noisy.
  // We just toast a one-time confirm when at least one flag is set,
  // when the operator clicks Continue. For now, silent on toggles.
  void familyName;

  const flags: Array<[string, keyof StudentFlags, boolean]> = [
    ["504 Plan", "has_504", data.has_504],
    ["IEP", "has_iep", data.has_iep],
    ["Learning disability", "has_learning_disability", data.has_learning_disability],
    ["ADHD / ADD", "has_adhd", data.has_adhd],
    ["Intellectual disability", "has_intellectual_disability", data.has_intellectual_disability],
    ["Health impairment", "has_health_impairment", data.has_health_impairment],
    ["Emotional disturbance", "has_emotional_disturbance", data.has_emotional_disturbance],
  ];

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
        {data.name}
      </Typography>
      <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ gap: 1 }}>
        {flags.map(([label, key, on]) => (
          <Chip
            key={key}
            label={label}
            clickable
            color={on ? "primary" : "default"}
            variant={on ? "filled" : "outlined"}
            onClick={() => patch.mutate({ [key]: !on })}
          />
        ))}
        <Chip
          label={data.autism_level ? `Autism ${data.autism_level}` : "Autism"}
          clickable
          color={data.autism_level ? "primary" : "default"}
          variant={data.autism_level ? "filled" : "outlined"}
          onClick={() =>
            patch.mutate({ autism_level: data.autism_level ? null : 1 })
          }
        />
        <Chip
          label="Other"
          clickable
          color={data.diagnosis_other ? "primary" : "default"}
          variant={data.diagnosis_other ? "filled" : "outlined"}
          onClick={() =>
            patch.mutate({
              diagnosis_other: data.diagnosis_other ? null : "(see student page)",
            })
          }
        />
      </Stack>
    </Paper>
  );
}

// ---- Step 5: Done ----------------------------------------------------------

function DoneStep({
  familyId,
  familyName,
}: {
  familyId: string | null;
  familyName: string | null;
}) {
  const navigate = useNavigate();
  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="overline" color="text.secondary">
          Step 5
        </Typography>
        <Typography variant="h4" sx={{ fontWeight: 600, mb: 0.5 }}>
          {familyName ? `${familyName} family is set up.` : "Setup complete."}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          The family, guardian(s), and student(s) are all saved. Next
          steps: fill in email + address on guardians, and capture
          notes, autism level, or "Other" detail on the student page.
        </Typography>
      </Box>
      <Divider />
      <Stack direction="row" justifyContent="flex-end" spacing={1}>
        <Button onClick={() => navigate("/")}>Back to home</Button>
        {familyId && (
          <Button variant="contained" onClick={() => navigate(`/families/${familyId}`)}>
            Open family page
          </Button>
        )}
      </Stack>
    </Stack>
  );
}
