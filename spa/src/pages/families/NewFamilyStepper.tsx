import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  Link,
  Stack,
  Step,
  StepLabel,
  Stepper,
  TextField,
  Typography,
} from "@mui/material";
import { DatePicker } from "@mui/x-date-pickers";
import dayjs, { type Dayjs } from "dayjs";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { api } from "../../api/client";
import type { components } from "../../api/schema";
import { LabeledField } from "../../components/LabeledField";
import { PersonSearchField } from "../../components/PersonSearchField";

type FamilyCreate = components["schemas"]["FamilyCreate"];
type ParentCreate = components["schemas"]["ParentCreate"];
type StudentCreate = components["schemas"]["StudentCreate"];
type PersonRow = components["schemas"]["PersonListRow"];

type AddedMember = {
  id: string;
  name: string;
  detail?: string;
  primary?: boolean;
  billing?: boolean;
};

/** Compact chip label: name + any role badges. */
function memberLabel(m: AddedMember): string {
  const badges = [m.primary && "primary", m.billing && "billing"].filter(Boolean);
  const suffix = badges.length
    ? ` · ${badges.join(" + ")}`
    : m.detail
      ? ` · ${m.detail}`
      : "";
  return `${m.name}${suffix}`;
}

const STEPS = ["Family", "Guardians", "Children", "Review"] as const;

/**
 * Guided "new family" flow: create the household, then optionally add
 * guardians and children (each step skippable), then review. Members use
 * the shared see-all/filter/create selector. The family is created at the
 * end of step 1 so members have something to attach to; closing partway
 * leaves a valid (if sparse) family the user can finish from the detail
 * page.
 */
export function NewFamilyStepper({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  /** Fired after the family is created so the caller can refetch its list. */
  onCreated: (familyId: string) => void;
}) {
  const navigate = useNavigate();
  const [active, setActive] = useState(0);
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [householdName, setHouseholdName] = useState("");
  const [notes, setNotes] = useState("");
  const [guardians, setGuardians] = useState<AddedMember[]>([]);
  const [students, setStudents] = useState<AddedMember[]>([]);

  const createFamily = useMutation({
    mutationFn: async (body: FamilyCreate): Promise<{ id: string }> => {
      const { data, error } = await api.POST("/api/families", { body });
      if (error || !data) {
        throw new Error(
          (error as { detail?: string } | undefined)?.detail ??
            "Failed to create family.",
        );
      }
      return data as unknown as { id: string };
    },
    onSuccess: (created) => {
      setFamilyId(created.id);
      onCreated(created.id);
      setActive(1);
    },
  });

  const reset = () => {
    setActive(0);
    setFamilyId(null);
    setHouseholdName("");
    setNotes("");
    setGuardians([]);
    setStudents([]);
    createFamily.reset();
  };

  const handleClose = () => {
    if (createFamily.isPending) return;
    reset();
    onClose();
  };

  const finish = () => {
    const id = familyId;
    reset();
    onClose();
    if (id) navigate(`/families/${id}`);
  };

  const canLeaveFamilyStep = Boolean(familyId) || householdName.trim().length > 0;

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>New family</DialogTitle>
      <DialogContent>
        <Stepper activeStep={active} sx={{ mt: 1, mb: 3 }}>
          {STEPS.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>

        {/* Step 0 — Family ------------------------------------------------ */}
        {active === 0 && (
          <Stack spacing={2}>
            <LabeledField label="Household name" required>
              <TextField
                autoFocus
                required
                placeholder='e.g. "Rivera Family"'
                value={householdName}
                onChange={(e) => setHouseholdName(e.target.value)}
                disabled={Boolean(familyId)}
                fullWidth
                inputProps={{ maxLength: 200 }}
              />
            </LabeledField>
            <LabeledField label="Notes">
              <TextField
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={Boolean(familyId)}
                fullWidth
                multiline
                rows={2}
              />
            </LabeledField>
            {familyId && (
              <Typography variant="caption" color="success.main">
                ✓ Family created — you can add members next.
              </Typography>
            )}
            {createFamily.error && (
              <Alert severity="error">{createFamily.error.message}</Alert>
            )}
          </Stack>
        )}

        {/* Step 1 — Guardians -------------------------------------------- */}
        {active === 1 && familyId && (
          <MemberStep
            familyId={familyId}
            variant="guardian"
            added={guardians}
            onAdded={(m) =>
              setGuardians((prev) => {
                // Primary/billing are one-per-family (backend demotes the
                // prior holder) — mirror that so the chips/review stay honest.
                let next = prev;
                if (m.primary) next = next.map((g) => ({ ...g, primary: false }));
                if (m.billing) next = next.map((g) => ({ ...g, billing: false }));
                return [...next, m];
              })
            }
          />
        )}

        {/* Step 2 — Children --------------------------------------------- */}
        {active === 2 && familyId && (
          <MemberStep
            familyId={familyId}
            variant="student"
            added={students}
            onAdded={(m) => setStudents((prev) => [...prev, m])}
          />
        )}

        {/* Step 3 — Review ----------------------------------------------- */}
        {active === 3 && (
          <Stack spacing={2}>
            <ReviewRow label="Household" values={[householdName.trim()]} />
            <Divider />
            <ReviewRow
              label="Guardians"
              values={guardians.map(memberLabel)}
              emptyText="None added — you can add them later."
            />
            <Divider />
            <ReviewRow
              label="Children"
              values={students.map((s) => s.name)}
              emptyText="None added — you can add them later."
            />
            <Typography variant="caption" color="text.secondary">
              Finishing opens the family page, where you can add more members
              or start an intake.
            </Typography>
          </Stack>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClose} disabled={createFamily.isPending}>
          Cancel
        </Button>
        <Box sx={{ flex: 1 }} />
        {active > 0 && active < 3 && (
          <Button onClick={() => setActive((s) => s - 1)}>Back</Button>
        )}
        {active === 0 && (
          <Button
            variant="contained"
            disabled={!canLeaveFamilyStep || createFamily.isPending}
            onClick={() => {
              if (familyId) setActive(1);
              else
                createFamily.mutate({
                  household_name: householdName.trim(),
                  notes: notes.trim() || null,
                });
            }}
          >
            {createFamily.isPending ? "Creating…" : "Create & continue"}
          </Button>
        )}
        {active === 1 && (
          <Button variant="contained" onClick={() => setActive(2)}>
            {guardians.length ? "Next" : "Skip"}
          </Button>
        )}
        {active === 2 && (
          <Button variant="contained" onClick={() => setActive(3)}>
            {students.length ? "Next" : "Skip"}
          </Button>
        )}
        {active === 3 && (
          <>
            <Button onClick={() => setActive(2)}>Back</Button>
            <Button variant="contained" onClick={finish}>
              Done
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}

// ---- One member-adding step (guardians or children) ---------------------

function MemberStep({
  familyId,
  variant,
  added,
  onAdded,
}: {
  familyId: string;
  variant: "guardian" | "student";
  added: AddedMember[];
  onAdded: (m: AddedMember) => void;
}) {
  const isStudent = variant === "student";
  const [creating, setCreating] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dob, setDob] = useState<Dayjs | null>(null);
  const [grade, setGrade] = useState("");
  // Guardian-only: primary is a pure designation (no gating); the contact
  // + billing details live behind a progressive expander.
  const [isPrimary, setIsPrimary] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [street1, setStreet1] = useState("");
  const [city, setCity] = useState("");
  const [stateCode, setStateCode] = useState("");
  const [postal, setPostal] = useState("");
  const [isBilling, setIsBilling] = useState(false);

  const resetForm = () => {
    setCreating(false);
    setFirstName("");
    setLastName("");
    setDob(null);
    setGrade("");
    setIsPrimary(false);
    setShowDetails(false);
    setEmail("");
    setPhone("");
    setStreet1("");
    setCity("");
    setStateCode("");
    setPostal("");
    setIsBilling(false);
  };

  // Backend rule: a billing contact needs email + street + ZIP. Only
  // offer the flag once all three are present so the create can't 422.
  const canBill = !!email.trim() && !!street1.trim() && !!postal.trim();

  const postGuardian = (body: ParentCreate) =>
    api.POST("/api/families/{family_id}/parents", {
      params: { path: { family_id: familyId } },
      body,
    });
  const postStudent = (body: StudentCreate) =>
    api.POST("/api/families/{family_id}/students", {
      params: { path: { family_id: familyId } },
      body,
    });

  const link = useMutation({
    mutationFn: async (person: PersonRow): Promise<AddedMember> => {
      const { data, error } = isStudent
        ? await postStudent({ person_id: person.id })
        : await postGuardian({
            person_id: person.id,
            role: "other",
            is_primary_contact: false,
            is_billing_contact: false,
          });
      if (error || !data) throw new Error(errMsg(error));
      return { id: person.id, name: formatName(person), detail: subtitle(person) };
    },
    onSuccess: onAdded,
  });

  const create = useMutation({
    mutationFn: async (): Promise<AddedMember> => {
      const first = firstName.trim();
      const last = lastName.trim();
      const { data, error } = isStudent
        ? await postStudent({
            first_name: first,
            last_name: last || null,
            dob: dob && dob.isValid() ? dob.format("YYYY-MM-DD") : null,
            current_grade: grade.trim() || null,
          })
        : await postGuardian({
            first_name: first,
            last_name: last || null,
            email: email.trim() || null,
            phone: phone.trim() || null,
            street1: street1.trim() || null,
            city: city.trim() || null,
            state: stateCode.trim() || null,
            postal_code: postal.trim() || null,
            role: "other",
            is_primary_contact: isPrimary,
            is_billing_contact: canBill && isBilling,
          });
      if (error || !data) throw new Error(errMsg(error));
      const rec = data as unknown as { id: string };
      const name = `${first}${last ? " " + last : ""}`;
      if (isStudent) {
        const detailBits = [
          grade.trim(),
          dob?.isValid() ? dob.format("MMM D, YYYY") : "",
        ].filter(Boolean);
        return { id: rec.id, name, detail: detailBits.join(" · ") || undefined };
      }
      return { id: rec.id, name, primary: isPrimary, billing: canBill && isBilling };
    },
    onSuccess: (m) => {
      onAdded(m);
      resetForm();
    },
  });

  const busy = link.isPending || create.isPending;
  const err = link.error || create.error;

  return (
    <Stack spacing={2}>
      {added.length > 0 && (
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
          {added.map((m) => (
            <Chip
              key={m.id}
              label={memberLabel(m)}
              color="primary"
              variant="outlined"
            />
          ))}
        </Box>
      )}

      {!creating ? (
        <LabeledField
          label={isStudent ? "Add a child" : "Add a guardian"}
          helperText={
            isStudent
              ? "Pick an existing student, or create a new one. This step is optional."
              : "Pick an existing contact, or create a new one. This step is optional."
          }
        >
          <PersonSearchField
            kind={isStudent ? "student" : undefined}
            placeholder={
              isStudent ? "Filter students by name…" : "Filter contacts by name or email…"
            }
            onPickExisting={(person) => link.mutate(person)}
            onCreateNew={(typed) => {
              const t = typed.trim();
              const i = t.indexOf(" ");
              setFirstName(i === -1 ? t : t.slice(0, i));
              setLastName(i === -1 ? "" : t.slice(i + 1).trim());
              setCreating(true);
            }}
          />
        </LabeledField>
      ) : (
        <Stack spacing={2}>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <LabeledField label="First name" required>
              <TextField
                autoFocus
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                fullWidth
                inputProps={{ maxLength: 100 }}
              />
            </LabeledField>
            <LabeledField label="Last name" required>
              <TextField
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                fullWidth
                inputProps={{ maxLength: 100 }}
              />
            </LabeledField>
          </Stack>
          {isStudent && (
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <LabeledField label="Date of birth">
                <DatePicker
                  value={dob}
                  onChange={setDob}
                  maxDate={dayjs()}
                  slotProps={{ textField: { fullWidth: true } }}
                />
              </LabeledField>
              <LabeledField label="Current grade">
                <TextField
                  placeholder='e.g. "8th"'
                  value={grade}
                  onChange={(e) => setGrade(e.target.value)}
                  fullWidth
                />
              </LabeledField>
            </Stack>
          )}
          {!isStudent && (
            <Box>
              <Box sx={{ mb: 0.5 }}>
                <FormControlLabel
                  control={
                    <Checkbox
                      size="small"
                      checked={isPrimary}
                      onChange={(e) => setIsPrimary(e.target.checked)}
                    />
                  }
                  label={
                    <Typography variant="body2">Set as primary contact</Typography>
                  }
                />
              </Box>
              <Link
                component="button"
                type="button"
                variant="body2"
                onClick={() => setShowDetails((s) => !s)}
              >
                {showDetails
                  ? "− Hide contact / billing details"
                  : "+ Add contact / billing details"}
              </Link>
              <Collapse in={showDetails}>
                <Stack spacing={2} sx={{ mt: 1.5 }}>
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
                  <LabeledField label="Street address">
                    <TextField
                      placeholder="123 Main St"
                      value={street1}
                      onChange={(e) => setStreet1(e.target.value)}
                      fullWidth
                      inputProps={{ maxLength: 200 }}
                    />
                  </LabeledField>
                  <Stack direction="row" spacing={2}>
                    <Box sx={{ flex: 2 }}>
                      <LabeledField label="City">
                        <TextField
                          value={city}
                          onChange={(e) => setCity(e.target.value)}
                          fullWidth
                        />
                      </LabeledField>
                    </Box>
                    <Box sx={{ flex: 1 }}>
                      <LabeledField label="State">
                        <TextField
                          placeholder="IL"
                          value={stateCode}
                          onChange={(e) => setStateCode(e.target.value)}
                          fullWidth
                        />
                      </LabeledField>
                    </Box>
                    <Box sx={{ flex: 1 }}>
                      <LabeledField label="ZIP">
                        <TextField
                          placeholder="62701"
                          value={postal}
                          onChange={(e) => setPostal(e.target.value)}
                          fullWidth
                          inputProps={{ maxLength: 10 }}
                        />
                      </LabeledField>
                    </Box>
                  </Stack>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={canBill && isBilling}
                        disabled={!canBill}
                        onChange={(e) => setIsBilling(e.target.checked)}
                      />
                    }
                    label={
                      <Typography variant="body2">
                        Set as billing contact
                        {!canBill && (
                          <Typography
                            component="span"
                            variant="caption"
                            color="text.secondary"
                          >
                            {" "}
                            — needs an email, street + ZIP
                          </Typography>
                        )}
                      </Typography>
                    }
                  />
                </Stack>
              </Collapse>
            </Box>
          )}
          <Stack direction="row" spacing={1} alignItems="center">
            <Button
              variant="contained"
              disabled={busy || !firstName.trim() || !lastName.trim()}
              onClick={() => create.mutate()}
            >
              {create.isPending ? "Adding…" : "Add"}
            </Button>
            <Link component="button" type="button" variant="caption" onClick={resetForm}>
              ← back to search
            </Link>
          </Stack>
        </Stack>
      )}

      {err && <Alert severity="error">{(err as Error).message}</Alert>}
    </Stack>
  );
}

function ReviewRow({
  label,
  values,
  emptyText,
}: {
  label: string;
  values: string[];
  emptyText?: string;
}) {
  const shown = values.filter((v) => v.trim());
  return (
    <Box>
      <Typography variant="overline" color="text.secondary">
        {label}
      </Typography>
      {shown.length ? (
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, mt: 0.5 }}>
          {shown.map((v, i) => (
            <Chip key={`${v}-${i}`} label={v} size="small" />
          ))}
        </Box>
      ) : (
        <Typography variant="body2" color="text.secondary">
          {emptyText ?? "—"}
        </Typography>
      )}
    </Box>
  );
}

function errMsg(error: unknown): string {
  return (error as { detail?: string } | undefined)?.detail ?? "Failed to add member.";
}

function formatName(p: PersonRow): string {
  return `${p.first_name}${p.last_name ? " " + p.last_name : ""}`.trim();
}

function subtitle(p: PersonRow): string {
  const bits: string[] = [];
  if (p.family_household_name) bits.push(`${p.family_household_name} family`);
  if (p.email) bits.push(p.email);
  return bits.join(" · ");
}
