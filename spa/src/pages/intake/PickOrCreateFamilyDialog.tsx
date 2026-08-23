import { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Paper,
  Stack,
  Step,
  StepLabel,
  Stepper,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import SearchIcon from "@mui/icons-material/Search";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../../api/client";
import { NewFamilyStepper } from "../families/NewFamilyStepper";

/** Two-step launcher: (1) see every family and pick one (filter as you
 *  type) or create a new one via the New Family stepper; (2) choose which
 *  of that family's guardians/children go on this intake. Hands the chosen
 *  family id + member ids back via onContinue. */
export interface FamilyPickerOption {
  id: string;
  household_name: string;
  primary_parent_name: string | null;
  student_names?: string[] | null;
}

type Member = { id: string; name: string };
type FamilyRoster = { parents: Member[]; students: Member[] };

export interface IntakeMembers {
  guardianIds: string[];
  studentIds: string[];
}

export function PickOrCreateFamilyDialog({
  open,
  title,
  continueLabel,
  onClose,
  onContinue,
}: {
  open: boolean;
  title: string;
  continueLabel: string;
  onClose: () => void;
  onContinue: (familyId: string, members: IntakeMembers) => void;
}) {
  const qc = useQueryClient();
  const [step, setStep] = useState<"family" | "roster">("family");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<FamilyPickerOption | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [prefillName, setPrefillName] = useState("");
  const [pendingSelectId, setPendingSelectId] = useState<string | null>(null);
  const [selGuardians, setSelGuardians] = useState<Set<string>>(new Set());
  const [selStudents, setSelStudents] = useState<Set<string>>(new Set());

  const families = useQuery<FamilyPickerOption[], Error>({
    queryKey: ["families", "intake-picker"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await api.GET("/api/families", {
        params: { query: { include_archived: false } },
      });
      if (error || !data) throw new Error("families fetch failed");
      return data as unknown as FamilyPickerOption[];
    },
  });

  // The picked family's roster, loaded on the roster step.
  const roster = useQuery<FamilyRoster, Error>({
    queryKey: ["families", "intake-roster", picked?.id],
    enabled: step === "roster" && !!picked?.id,
    queryFn: async () => {
      const { data, error } = await api.GET("/api/families/{family_id}", {
        params: { path: { family_id: picked!.id } },
      });
      if (error || !data) throw new Error("family fetch failed");
      return data as unknown as FamilyRoster;
    },
  });

  // Default every member checked when the roster lands.
  const seededFor = useRef<string | null>(null);
  useEffect(() => {
    if (step !== "roster" || !roster.data) return;
    if (seededFor.current === picked?.id) return;
    seededFor.current = picked?.id ?? null;
    setSelGuardians(new Set(roster.data.parents.map((p) => p.id)));
    setSelStudents(new Set(roster.data.students.map((s) => s.id)));
  }, [step, roster.data, picked?.id]);

  useEffect(() => {
    if (!pendingSelectId || !families.data) return;
    const match = families.data.find((f) => f.id === pendingSelectId);
    if (match) {
      setPicked(match);
      setPendingSelectId(null);
    }
  }, [pendingSelectId, families.data]);

  // Reset each time the dialog opens.
  useEffect(() => {
    if (open) {
      setStep("family");
      setQuery("");
      setPicked(null);
      setAddOpen(false);
      setPrefillName("");
      setPendingSelectId(null);
      setSelGuardians(new Set());
      setSelStudents(new Set());
      seededFor.current = null;
    }
  }, [open]);

  const all = families.data ?? [];
  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return all;
    return all.filter((f) =>
      [f.household_name, f.primary_parent_name ?? "", ...(f.student_names ?? [])]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [all, q]);

  const toggle = (set: Set<string>, setSet: (s: Set<string>) => void, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSet(next);
  };

  const startIntake = () => {
    if (!picked) return;
    onContinue(picked.id, {
      guardianIds: [...selGuardians],
      studentIds: [...selStudents],
    });
  };

  return (
    <>
      <Dialog open={open && !addOpen} onClose={onClose} maxWidth="sm" fullWidth>
        <DialogTitle>{title}</DialogTitle>
        <DialogContent>
          <Stepper activeStep={step === "family" ? 0 : 1} sx={{ mt: 1, mb: 2.5 }}>
            <Step>
              <StepLabel>Family</StepLabel>
            </Step>
            <Step>
              <StepLabel>Roster</StepLabel>
            </Step>
          </Stepper>

          {step === "family" ? (
            <Stack spacing={1}>
              <TextField
                autoFocus
                size="small"
                fullWidth
                placeholder="Filter by household, parent, or student…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <SearchIcon fontSize="small" sx={{ color: "text.disabled", mr: 1 }} />
                  ),
                  endAdornment: families.isPending ? <CircularProgress size={16} /> : null,
                }}
              />
              <Paper variant="outlined" sx={{ height: 300, overflowY: "auto" }}>
                <List dense disablePadding>
                  <ListItemButton
                    onClick={() => {
                      setPrefillName(query.trim());
                      setAddOpen(true);
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 32, color: "primary.main" }}>
                      <AddIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText
                      primaryTypographyProps={{ color: "primary.main", fontWeight: 600 }}
                      primary={
                        q ? `Create "${query.trim()}" as a new family` : "Create new family"
                      }
                    />
                  </ListItemButton>
                  <Divider />
                  {filtered.length === 0 ? (
                    <ListItem>
                      <ListItemText
                        secondary={
                          families.isPending
                            ? "Loading…"
                            : all.length === 0
                              ? "No families yet — create one above."
                              : "No matches — create above, or clear the filter."
                        }
                      />
                    </ListItem>
                  ) : (
                    filtered.map((f) => (
                      <ListItemButton
                        key={f.id}
                        selected={picked?.id === f.id}
                        onClick={() => setPicked(f)}
                      >
                        <ListItemText
                          primary={f.household_name}
                          secondary={familySubtitle(f)}
                          secondaryTypographyProps={{ variant: "caption" }}
                        />
                      </ListItemButton>
                    ))
                  )}
                </List>
              </Paper>
              {all.length > 0 && (
                <Typography variant="caption" color="text.secondary" sx={{ px: 0.5 }}>
                  {q
                    ? `${filtered.length} of ${all.length} shown`
                    : `${all.length} famil${all.length === 1 ? "y" : "ies"} — pick one, or filter above`}
                </Typography>
              )}
            </Stack>
          ) : (
            <RosterStep
              householdName={picked?.household_name ?? ""}
              roster={roster.data}
              loading={roster.isPending}
              selGuardians={selGuardians}
              selStudents={selStudents}
              onToggleGuardian={(id) => toggle(selGuardians, setSelGuardians, id)}
              onToggleStudent={(id) => toggle(selStudents, setSelStudents, id)}
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Box sx={{ flex: 1 }} />
          {step === "roster" && (
            <Button onClick={() => setStep("family")}>Back</Button>
          )}
          {step === "family" ? (
            <Button
              variant="contained"
              disabled={!picked}
              onClick={() => setStep("roster")}
            >
              Next
            </Button>
          ) : (
            <Button variant="contained" disabled={!picked} onClick={startIntake}>
              {continueLabel}
            </Button>
          )}
        </DialogActions>
      </Dialog>

      <NewFamilyStepper
        key={addOpen ? `add-${prefillName}` : "add-closed"}
        open={addOpen}
        initialHouseholdName={prefillName}
        navigateOnDone={false}
        onClose={() => setAddOpen(false)}
        onCreated={(id) => {
          // Family row exists after step 1 of the wizard — capture it so a
          // mid-wizard cancel still leaves it selected in the picker.
          setPicked({
            id,
            household_name: prefillName,
            primary_parent_name: null,
            student_names: [],
          });
          setPendingSelectId(id);
          qc.invalidateQueries({ queryKey: ["families", "intake-picker"] });
        }}
        onDone={(id, members) => {
          // Wizard already collected the members — go straight into the
          // intake seeded with them (no separate roster step needed).
          onContinue(id, members);
        }}
      />
    </>
  );
}

function RosterStep({
  householdName,
  roster,
  loading,
  selGuardians,
  selStudents,
  onToggleGuardian,
  onToggleStudent,
}: {
  householdName: string;
  roster: FamilyRoster | undefined;
  loading: boolean;
  selGuardians: Set<string>;
  selStudents: Set<string>;
  onToggleGuardian: (id: string) => void;
  onToggleStudent: (id: string) => void;
}) {
  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
        <CircularProgress size={22} />
      </Box>
    );
  }
  const parents = roster?.parents ?? [];
  const students = roster?.students ?? [];
  if (parents.length === 0 && students.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        {householdName} has no guardians or children on file yet. You can add
        them on the intake after it's created.
      </Typography>
    );
  }
  return (
    <Stack spacing={2}>
      <Typography variant="body2" color="text.secondary">
        Choose who's part of this intake for {householdName}. You can adjust the
        roster later.
      </Typography>
      <Box>
        <Typography variant="overline" color="text.secondary">
          Guardians
        </Typography>
        {parents.length ? (
          <Stack>
            {parents.map((p) => (
              <FormControlLabel
                key={p.id}
                control={
                  <Checkbox
                    size="small"
                    checked={selGuardians.has(p.id)}
                    onChange={() => onToggleGuardian(p.id)}
                  />
                }
                label={<Typography variant="body2">{p.name}</Typography>}
              />
            ))}
          </Stack>
        ) : (
          <Typography variant="body2" color="text.secondary">
            None on file.
          </Typography>
        )}
      </Box>
      <Box>
        <Typography variant="overline" color="text.secondary">
          Children
        </Typography>
        {students.length ? (
          <Stack>
            {students.map((s) => (
              <FormControlLabel
                key={s.id}
                control={
                  <Checkbox
                    size="small"
                    checked={selStudents.has(s.id)}
                    onChange={() => onToggleStudent(s.id)}
                  />
                }
                label={<Typography variant="body2">{s.name}</Typography>}
              />
            ))}
          </Stack>
        ) : (
          <Typography variant="body2" color="text.secondary">
            None on file.
          </Typography>
        )}
      </Box>
    </Stack>
  );
}

function familySubtitle(f: FamilyPickerOption): string {
  const bits: string[] = [
    f.primary_parent_name ? `Primary: ${f.primary_parent_name}` : "No primary parent",
  ];
  if ((f.student_names?.length ?? 0) > 0) bits.push(f.student_names!.join(", "));
  return bits.join(" · ");
}
