import { useEffect, useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Breadcrumbs,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Link as MuiLink,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ReplayIcon from "@mui/icons-material/Replay";
import { DatePicker } from "@mui/x-date-pickers";
import dayjs, { type Dayjs } from "dayjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link as RouterLink, useNavigate, useParams } from "react-router-dom";

import { api } from "../../api/client";
import { PageHeader } from "../../components/PageHeader";
import { RichTextEditor } from "../../components/RichTextEditor";
import { StatusChip } from "../../components/StatusChip";
import { useSnackbar } from "../../components/Snackbar";

// /api/intakes/:id returns a plain dict; hand-typed here.
interface Intake {
  id: string;
  family_id: string;
  intake_date: string;
  consultant_id: string | null;
  notes: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface GuardianRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string;
  is_primary_contact: boolean;
  is_billing_contact: boolean;
}

interface StudentRow {
  id: string;
  name: string;
  dob: string | null;
  current_grade: string | null;
}

interface FamilyDetail {
  id: string;
  household_name: string;
  parents: GuardianRow[];
  students: StudentRow[];
}

/** Intake detail page at /intakes/:id. The family is locked once the
 *  intake exists; everything else auto-saves on blur. New intakes are
 *  created from the IntakesList or the home page via the family
 *  picker modal, so by the time we land here the row already exists. */
export function IntakeForm() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const snackbar = useSnackbar();
  const navigate = useNavigate();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const intake = useQuery<Intake, Error>({
    queryKey: ["intakes", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error, response } = await api.GET(
        "/api/intakes/{intake_id}",
        { params: { path: { intake_id: id! } } },
      );
      if (response.status === 404) throw new Error("Intake not found.");
      if (error || !data) throw new Error("Failed to load intake.");
      return data as unknown as Intake;
    },
  });

  const family = useQuery<FamilyDetail, Error>({
    queryKey: ["families", "intake-detail", intake.data?.family_id],
    enabled: !!intake.data?.family_id,
    queryFn: async () => {
      const { data, error } = await api.GET("/api/families/{family_id}", {
        params: { path: { family_id: intake.data!.family_id } },
      });
      if (error || !data) throw new Error("Failed to load family.");
      return data as unknown as FamilyDetail;
    },
  });

  const patch = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      if (!id) return;
      const { error } = await api.PATCH("/api/intakes/{intake_id}", {
        params: { path: { intake_id: id } },
        body: body as never,
      });
      if (error) {
        const msg = (error as { detail?: string }).detail ?? "Save failed.";
        throw new Error(msg);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["intakes", id] });
      qc.invalidateQueries({ queryKey: ["intakes", "list"] });
    },
    onError: (e: Error) => snackbar.show(e.message, "error"),
  });

  const toggleComplete = useMutation({
    mutationFn: async (action: "complete" | "reopen") => {
      if (!id) return;
      const path = action === "complete"
        ? "/api/intakes/{intake_id}/complete"
        : "/api/intakes/{intake_id}/reopen";
      const { error } = await api.POST(path, {
        params: { path: { intake_id: id } as never },
      });
      if (error) {
        const msg = (error as { detail?: string }).detail ?? "Save failed.";
        throw new Error(msg);
      }
    },
    onSuccess: (_d, action) => {
      qc.invalidateQueries({ queryKey: ["intakes", id] });
      qc.invalidateQueries({ queryKey: ["intakes", "list"] });
      snackbar.show(action === "complete" ? "Intake marked complete" : "Intake reopened");
    },
    onError: (e: Error) => snackbar.show(e.message, "error"),
  });

  const remove = useMutation({
    mutationFn: async () => {
      if (!id) return;
      const { error } = await api.DELETE("/api/intakes/{intake_id}", {
        params: { path: { intake_id: id } },
      });
      if (error) {
        const msg = (error as { detail?: string }).detail ?? "Delete failed.";
        throw new Error(msg);
      }
    },
    onSuccess: () => {
      snackbar.show("Intake deleted");
      qc.invalidateQueries({ queryKey: ["intakes", "list"] });
      navigate("/intakes");
    },
    onError: (e: Error) => snackbar.show(e.message, "error"),
  });

  if (intake.error) {
    return <Alert severity="error">{intake.error.message}</Alert>;
  }
  if (intake.isPending || !intake.data) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  const isComplete = !!intake.data.completed_at;

  return (
    <Stack spacing={3}>
      <PageHeader
        title={
          <Stack direction="row" alignItems="center" spacing={1}>
            <Box component="span">Intake</Box>
            <StatusChip
              size="small"
              label={isComplete ? "completed" : "in progress"}
              tone={isComplete ? "success" : "info"}
              variant="outlined"
            />
          </Stack>
        }
        subtitle={
          isComplete
            ? `Completed ${dayjs(intake.data.completed_at!).format("MMM D, YYYY")} · intake date ${dayjs(intake.data.intake_date).format("MMM D, YYYY")}`
            : `Intake date ${dayjs(intake.data.intake_date).format("MMM D, YYYY")} — changes save automatically.`
        }
        breadcrumbs={
          <Breadcrumbs>
            <MuiLink component={RouterLink} to="/intakes" color="inherit" underline="hover">
              Intakes
            </MuiLink>
            {family.data ? (
              <MuiLink
                component={RouterLink}
                to={`/families/${family.data.id}`}
                color="inherit"
                underline="hover"
              >
                {family.data.household_name}
              </MuiLink>
            ) : (
              <Typography color="text.primary">…</Typography>
            )}
          </Breadcrumbs>
        }
        actions={
          <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
            {isComplete ? (
              <Button
                variant="outlined"
                startIcon={<ReplayIcon />}
                disabled={toggleComplete.isPending}
                onClick={() => toggleComplete.mutate("reopen")}
              >
                Reopen
              </Button>
            ) : (
              <Button
                variant="contained"
                startIcon={<CheckCircleOutlineIcon />}
                disabled={toggleComplete.isPending}
                onClick={() => toggleComplete.mutate("complete")}
              >
                Mark complete
              </Button>
            )}
            <Button
              color="error"
              variant="outlined"
              startIcon={<DeleteOutlineIcon />}
              onClick={() => setConfirmingDelete(true)}
            >
              Delete
            </Button>
          </Stack>
        }
      />

      {/* Roster sections collapse into accordions on top so the
          consultant can capture them once, fold them away, and have
          the notes editor span the full width for the rest of the
          meeting. */}
      <GuardiansSection family={family.data ?? null} loading={family.isPending} />
      <StudentsSection family={family.data ?? null} loading={family.isPending} />

      <IntakeNotesSection
        initial={intake.data.notes ?? ""}
        onCommit={(html) => patch.mutate({ notes: html || null })}
      />

      <Dialog open={confirmingDelete} onClose={() => setConfirmingDelete(false)}>
        <DialogTitle>Delete this intake?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Soft-deletes the intake. Engagements that linked back to it
            keep their reference but stop seeing the intake's notes.
            You can recover from the database if needed.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmingDelete(false)} disabled={remove.isPending}>
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            disabled={remove.isPending}
            onClick={() => remove.mutate()}
          >
            {remove.isPending ? "Deleting…" : "Delete intake"}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

// ---- Intake notes (auto-save on blur) -------------------------------------

function IntakeNotesSection({
  initial,
  onCommit,
}: {
  initial: string;
  onCommit: (html: string) => void;
}) {
  const [value, setValue] = useState(initial);
  // Local edits don't lock the input on parent refetches — only sync
  // when the canonical value actually changes.
  useEffect(() => {
    setValue(initial);
  }, [initial]);
  return (
    <Paper variant="outlined" sx={{ p: 2, display: "flex", flexDirection: "column" }}>
      <Typography variant="overline" color="text.secondary" sx={{ display: "block", mb: 1 }}>
        Intake notes
      </Typography>
      <Box
        sx={{ display: "flex" }}
        onBlur={(e) => {
          // Commit when focus leaves the editor entirely. relatedTarget
          // is null if focus moves outside this subtree.
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            if (value !== initial) onCommit(value);
          }
        }}
      >
        <RichTextEditor
          value={value}
          onChange={setValue}
          placeholder="What did the family say? What stood out? Anything to follow up on."
          minRows={12}
        />
      </Box>
    </Paper>
  );
}

// ---- Guardians section -----------------------------------------------------

function GuardiansSection({
  family,
  loading,
}: {
  family: FamilyDetail | null;
  loading: boolean;
}) {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const guardians = family?.parents ?? [];

  return (
    <Accordion variant="outlined" defaultExpanded disableGutters>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        {/* No interactive element in here — AccordionSummary already
            renders as a <button>, and nesting another button is
            invalid HTML. The Add control lives at the top of the
            expanded panel instead. */}
        <Typography variant="overline" color="text.secondary" sx={{ flex: 1 }}>
          Family guardians
          {!loading && family && (
            <Box component="span" sx={{ ml: 1, color: "text.disabled", fontWeight: 400 }}>
              ({guardians.length})
            </Box>
          )}
        </Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Stack direction="row" justifyContent="flex-end" sx={{ mb: 1 }}>
          <Button
            size="small"
            variant="text"
            startIcon={<AddIcon fontSize="small" />}
            disabled={!family}
            onClick={() => setAddOpen(true)}
          >
            Add guardian
          </Button>
        </Stack>
        {loading || !family ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
            <CircularProgress size={20} />
          </Box>
        ) : guardians.length === 0 ? (
          <Typography variant="body2" color="text.disabled">
            No guardians on file yet.
          </Typography>
        ) : (
          <Stack divider={<Divider flexItem />} spacing={0}>
            {guardians.map((g) => (
              <Stack key={g.id} direction="row" alignItems="center" spacing={1} sx={{ py: 1 }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Stack direction="row" spacing={0.5} alignItems="baseline" sx={{ mb: 0.25 }}>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      {g.name || "(no name)"}
                    </Typography>
                    {g.is_primary_contact && (
                      <Chip size="small" label="primary" color="primary" variant="outlined" />
                    )}
                    {g.is_billing_contact && (
                      <Chip size="small" label="billing" color="success" variant="outlined" />
                    )}
                  </Stack>
                  <Stack direction="row" spacing={1.5} sx={{ color: "text.secondary", fontSize: 12 }}>
                    {g.email && <Box component="span">{g.email}</Box>}
                    {g.phone && <Box component="span">{g.phone}</Box>}
                  </Stack>
                </Box>
              </Stack>
            ))}
          </Stack>
        )}

        <AddGuardianDialog
          key={addOpen ? `add-${family?.id}` : "closed"}
          open={addOpen}
          familyId={family?.id ?? null}
          onClose={() => setAddOpen(false)}
          onCreated={() => {
            setAddOpen(false);
            qc.invalidateQueries({ queryKey: ["families", "intake-detail", family?.id] });
            qc.invalidateQueries({ queryKey: ["families", "intake-picker"] });
          }}
        />
      </AccordionDetails>
    </Accordion>
  );
}

function AddGuardianDialog({
  open,
  familyId,
  onClose,
  onCreated,
}: {
  open: boolean;
  familyId: string | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const snackbar = useSnackbar();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      if (!familyId) throw new Error("No family selected.");
      const { data, error } = await api.POST(
        "/api/families/{family_id}/parents",
        {
          params: { path: { family_id: familyId } },
          body: {
            first_name: firstName.trim() || null,
            last_name: lastName.trim() || null,
            email: email.trim() || null,
            phone: phone.trim() || null,
          } as never,
        },
      );
      if (error || !data) {
        const msg =
          (error as { detail?: string } | undefined)?.detail ??
          "Failed to add guardian.";
        throw new Error(msg);
      }
      return data;
    },
    onSuccess: () => {
      snackbar.show("Guardian added");
      onCreated();
    },
    onError: (e: Error) => snackbar.show(e.message, "error"),
  });

  const canSubmit =
    !!familyId && !create.isPending && (firstName.trim() || lastName.trim());

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Add guardian</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField
              autoFocus
              size="small"
              label="First name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              fullWidth
            />
            <TextField
              size="small"
              label="Last name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              fullWidth
            />
          </Stack>
          <TextField
            size="small"
            label="Phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            fullWidth
          />
          <TextField
            size="small"
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            fullWidth
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={create.isPending}>
          Cancel
        </Button>
        <Button
          variant="contained"
          disabled={!canSubmit}
          onClick={() => create.mutate()}
        >
          {create.isPending ? "Adding…" : "Add"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ---- Students section -----------------------------------------------------

function StudentsSection({
  family,
  loading,
}: {
  family: FamilyDetail | null;
  loading: boolean;
}) {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const students = family?.students ?? [];

  return (
    <Accordion variant="outlined" defaultExpanded disableGutters>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        {/* Add button lives in the expanded panel — nesting a Button
            inside AccordionSummary's button is invalid HTML. */}
        <Typography variant="overline" color="text.secondary" sx={{ flex: 1 }}>
          Students
          {!loading && family && (
            <Box component="span" sx={{ ml: 1, color: "text.disabled", fontWeight: 400 }}>
              ({students.length})
            </Box>
          )}
        </Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Stack direction="row" justifyContent="flex-end" sx={{ mb: 1 }}>
          <Button
            size="small"
            variant="text"
            startIcon={<AddIcon fontSize="small" />}
            disabled={!family}
            onClick={() => setAddOpen(true)}
          >
            Add student
          </Button>
        </Stack>
        {loading || !family ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
            <CircularProgress size={20} />
          </Box>
        ) : students.length === 0 ? (
          <Typography variant="body2" color="text.disabled">
            No students on file yet.
          </Typography>
        ) : (
          <Stack divider={<Divider flexItem />} spacing={0}>
            {students.map((s) => (
              <Stack key={s.id} direction="row" alignItems="center" spacing={1} sx={{ py: 1 }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    {s.name || "(no name)"}
                  </Typography>
                  <Stack direction="row" spacing={1.5} sx={{ color: "text.secondary", fontSize: 12 }}>
                    {s.current_grade && (
                      <Box component="span">Grade {s.current_grade}</Box>
                    )}
                    {s.dob && (
                      <Box component="span">DOB {dayjs(s.dob).format("MMM D, YYYY")}</Box>
                    )}
                  </Stack>
                </Box>
              </Stack>
            ))}
          </Stack>
        )}

        <AddStudentDialog
          // Remount per open so useState starts blank each time.
          key={addOpen ? `add-${family?.id}` : "closed"}
          open={addOpen}
          familyId={family?.id ?? null}
          onClose={() => setAddOpen(false)}
          onCreated={() => {
            setAddOpen(false);
            qc.invalidateQueries({ queryKey: ["families", "intake-detail", family?.id] });
            qc.invalidateQueries({ queryKey: ["families", "intake-picker"] });
          }}
        />
      </AccordionDetails>
    </Accordion>
  );
}

function AddStudentDialog({
  open,
  familyId,
  onClose,
  onCreated,
}: {
  open: boolean;
  familyId: string | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const snackbar = useSnackbar();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dob, setDob] = useState<Dayjs | null>(null);
  const [grade, setGrade] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      if (!familyId) throw new Error("No family selected.");
      const { data, error } = await api.POST(
        "/api/families/{family_id}/students",
        {
          params: { path: { family_id: familyId } },
          body: {
            first_name: firstName.trim() || null,
            last_name: lastName.trim() || null,
            dob: dob && dob.isValid() ? dob.format("YYYY-MM-DD") : null,
            current_grade: grade.trim() || null,
          } as never,
        },
      );
      if (error || !data) {
        const msg =
          (error as { detail?: string } | undefined)?.detail ??
          "Failed to add student.";
        throw new Error(msg);
      }
      return data;
    },
    onSuccess: () => {
      snackbar.show("Student added");
      onCreated();
    },
    onError: (e: Error) => snackbar.show(e.message, "error"),
  });

  const canSubmit =
    !!familyId &&
    !create.isPending &&
    !!firstName.trim() &&
    !!lastName.trim();

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Add student</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField
              autoFocus
              required
              size="small"
              label="First name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              fullWidth
            />
            <TextField
              required
              size="small"
              label="Last name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              fullWidth
            />
          </Stack>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <DatePicker
              label="Date of birth"
              value={dob}
              onChange={(v) => setDob(v)}
              // openTo=year lets you type the year first in the
              // calendar popover; the textfield itself accepts a
              // typed MM/DD/YYYY too without Safari's native
              // year-rejection quirk.
              openTo="year"
              views={["year", "month", "day"]}
              slotProps={{ textField: { size: "small", fullWidth: true } }}
            />
            <TextField
              size="small"
              label="Current grade"
              placeholder='e.g. "8th"'
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              fullWidth
            />
          </Stack>
          <Typography variant="caption" color="text.disabled">
            Diagnoses, current school, and other clinical fields are
            edited from the student detail page once the row exists.
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={create.isPending}>
          Cancel
        </Button>
        <Button
          variant="contained"
          disabled={!canSubmit}
          onClick={() => create.mutate()}
        >
          {create.isPending ? "Adding…" : "Add"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
