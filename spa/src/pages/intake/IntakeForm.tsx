import { useEffect, useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Autocomplete,
  Box,
  Breadcrumbs,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  CircularProgress,
  createFilterOptions,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Link as MuiLink,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ReplayIcon from "@mui/icons-material/Replay";
import { DatePicker } from "@mui/x-date-pickers";
import dayjs, { type Dayjs } from "dayjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link as RouterLink, useNavigate, useParams } from "react-router-dom";

import { api } from "../../api/client";
import { LabeledField } from "../../components/LabeledField";
import { PageHeader } from "../../components/PageHeader";
import { RichTextEditor } from "../../components/RichTextEditor";
import { StatusChip } from "../../components/StatusChip";
import { useSnackbar } from "../../components/Snackbar";
import { ParentDrawer } from "../families/ParentDrawer";
import type { ParentDrawerTarget } from "../families/ParentDrawer";

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
  mailing_address: string | null;
  billing_address: string | null;
}

interface StudentRow {
  id: string;
  name: string;
  dob: string | null;
  current_grade: string | null;
  has_504?: boolean;
  has_iep?: boolean;
  has_learning_disability?: boolean;
  has_adhd?: boolean;
  has_intellectual_disability?: boolean;
  has_health_impairment?: boolean;
  has_emotional_disturbance?: boolean;
  autism_level?: number | null;
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
  // Anchor for the header's kebab menu. Single button replaces what
  // were two separate header buttons (mark-complete/reopen + delete).
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);

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
          <>
            <Tooltip title="Intake actions">
              <IconButton
                onClick={(e) => setMenuAnchor(e.currentTarget)}
                aria-label="Intake actions"
                size="medium"
              >
                <MoreVertIcon />
              </IconButton>
            </Tooltip>
            <Menu
              anchorEl={menuAnchor}
              open={!!menuAnchor}
              onClose={() => setMenuAnchor(null)}
              anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
              transformOrigin={{ vertical: "top", horizontal: "right" }}
            >
              {isComplete ? (
                <MenuItem
                  disabled={toggleComplete.isPending}
                  onClick={() => {
                    setMenuAnchor(null);
                    toggleComplete.mutate("reopen");
                  }}
                >
                  <ListItemIcon>
                    <ReplayIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText>Reopen</ListItemText>
                </MenuItem>
              ) : (
                <MenuItem
                  disabled={toggleComplete.isPending}
                  onClick={() => {
                    setMenuAnchor(null);
                    toggleComplete.mutate("complete");
                  }}
                >
                  <ListItemIcon>
                    <CheckCircleOutlineIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText>Mark complete</ListItemText>
                </MenuItem>
              )}
              <MenuItem
                onClick={() => {
                  setMenuAnchor(null);
                  setConfirmingDelete(true);
                }}
                sx={{ color: "error.main" }}
              >
                <ListItemIcon>
                  <DeleteOutlineIcon fontSize="small" sx={{ color: "error.main" }} />
                </ListItemIcon>
                <ListItemText>Delete</ListItemText>
              </MenuItem>
            </Menu>
          </>
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

/** Pseudo-button rendered as <span role="button"> so it can sit
 *  inside an AccordionSummary (which is itself a <button>) without
 *  the validateDOMNesting warning. Behaves like a small text button
 *  with an Add icon. stopPropagation on the click + Enter/Space
 *  keeps the accordion from toggling underneath. */
function AddAction({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  const handle = (e: React.SyntheticEvent) => {
    e.stopPropagation();
    if (!disabled) onClick();
  };
  return (
    <Box
      component="span"
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled || undefined}
      onClick={handle}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") handle(e);
      }}
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: 0.5,
        px: 1,
        py: 0.5,
        fontSize: 13,
        fontWeight: 500,
        borderRadius: 1,
        color: disabled ? "text.disabled" : "primary.main",
        cursor: disabled ? "default" : "pointer",
        userSelect: "none",
        "&:hover": {
          bgcolor: disabled ? "transparent" : "action.hover",
        },
      }}
    >
      <AddIcon fontSize="small" />
      {label}
    </Box>
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
  // Drawer target — open == not-null. We pass the row straight from
  // the family-detail query; the drawer fetches its own structured
  // mailing/billing fields internally.
  const [drawerGuardian, setDrawerGuardian] = useState<ParentDrawerTarget | null>(null);
  const guardians = family?.parents ?? [];
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["families", "intake-detail", family?.id] });
    qc.invalidateQueries({ queryKey: ["families", "intake-picker"] });
  };

  return (
    <Accordion variant="outlined" disableGutters>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Stack
          direction="row"
          alignItems="center"
          spacing={1}
          sx={{ width: "100%" }}
        >
          <Typography variant="overline" color="text.secondary" sx={{ flex: 1 }}>
            Family guardians
            {!loading && family && (
              <Box component="span" sx={{ ml: 1, color: "text.disabled", fontWeight: 400 }}>
                ({guardians.length})
              </Box>
            )}
          </Typography>
          {/* Pseudo-button: AccordionSummary already renders a <button>
              for the toggle, so nesting an MUI Button here would
              fail validateDOMNesting. A Box with role="button" stays
              valid HTML and stopPropagation keeps the click from
              toggling the accordion. */}
          <AddAction
            label="Add guardian"
            disabled={!family}
            onClick={() => setAddOpen(true)}
          />
        </Stack>
      </AccordionSummary>
      <AccordionDetails>
        {loading || !family ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
            <CircularProgress size={20} />
          </Box>
        ) : guardians.length === 0 ? (
          <Typography variant="body2" color="text.disabled">
            No guardians on file yet.
          </Typography>
        ) : (
          // Flex-wrap layout with a sane card width so a single
          // guardian doesn't stretch across the full panel. Each
          // card has a ~300px target and never exceeds 360px;
          // multiples wrap naturally.
          <Stack direction="row" useFlexGap flexWrap="wrap" sx={{ gap: 2 }}>
            {guardians.map((g) => (
              <Box key={g.id} sx={{ flex: "1 1 300px", maxWidth: 360 }}>
                <GuardianCard
                  guardian={g}
                  onOpen={() => setDrawerGuardian(g)}
                />
              </Box>
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
            invalidate();
          }}
        />
        <ParentDrawer
          open={!!drawerGuardian}
          // Keep the drawer in sync with the refetched family detail
          // so edits made inside it are reflected on close.
          parent={
            drawerGuardian
              ? guardians.find((g) => g.id === drawerGuardian.id) ?? drawerGuardian
              : null
          }
          onClose={() => setDrawerGuardian(null)}
          onChanged={invalidate}
          onRemoved={() => {
            setDrawerGuardian(null);
            invalidate();
          }}
        />
      </AccordionDetails>
    </Accordion>
  );
}

/** Single guardian as a clickable card. Surfaces the contact info the
 *  consultant uses live (name, role, email, phone, mailing address);
 *  full editing opens in the right-side ParentDrawer on click. */
function GuardianCard({
  guardian,
  onOpen,
}: {
  guardian: GuardianRow;
  onOpen: () => void;
}) {
  const role = guardian.role && guardian.role !== "other" ? guardian.role : null;
  return (
    <Card
      variant="outlined"
      sx={{
        height: "100%",
        transition: (t) => t.transitions.create(["border-color", "background-color"]),
        "&:hover": { borderColor: "primary.light", bgcolor: "action.hover" },
      }}
    >
      <CardActionArea onClick={onOpen} sx={{ height: "100%" }}>
        <CardContent>
          <Stack direction="row" spacing={0.5} sx={{ mb: 0.75, minHeight: 24 }}>
            {guardian.is_primary_contact && (
              <Chip size="small" label="primary" color="primary" variant="outlined" />
            )}
            {guardian.is_billing_contact && (
              <Chip size="small" label="billing" color="success" variant="outlined" />
            )}
            {role && (
              <Chip
                size="small"
                label={role.replace(/_/g, " ")}
                variant="outlined"
                sx={{ textTransform: "capitalize" }}
              />
            )}
          </Stack>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            {guardian.name || "(no name)"}
          </Typography>
          {guardian.email && (
            <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
              {guardian.email}
            </Typography>
          )}
          {guardian.phone && (
            <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
              {guardian.phone}
            </Typography>
          )}
          {guardian.mailing_address && (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{
                display: "block",
                whiteSpace: "pre-line",
                mt: 0.75,
              }}
            >
              {guardian.mailing_address}
            </Typography>
          )}
          {guardian.is_billing_contact &&
            guardian.billing_address &&
            guardian.billing_address !== guardian.mailing_address && (
              <Box sx={{ mt: 0.75 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, display: "block" }}>
                  Billing address
                </Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: "block", whiteSpace: "pre-line" }}
                >
                  {guardian.billing_address}
                </Typography>
              </Box>
            )}
        </CardContent>
      </CardActionArea>
    </Card>
  );
}

interface GuardianPersonOption {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  family_id: string | null;
  family_household_name: string | null;
}

type GuardianEntry =
  | { kind: "person"; person: GuardianPersonOption }
  | { kind: "add"; label: string };

const filterGuardians = createFilterOptions<GuardianEntry>({
  stringify: (entry) => {
    if (entry.kind === "add") return entry.label;
    const p = entry.person;
    return [
      p.first_name ?? "",
      p.last_name ?? "",
      p.email ?? "",
      p.family_household_name ?? "",
    ].join(" ");
  },
});

/** Two-stage dialog. First, search for an existing guardian by name
 *  or email — that's the common path when a parent has reached out
 *  before. Picking a row links them to this family via person_id.
 *  Falling back to "+ Add new" reveals the create form for a brand-
 *  new person. */
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
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<GuardianPersonOption | null>(null);
  const [creating, setCreating] = useState(false);
  // Form fields for the "+ Add new" path.
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const people = useQuery<GuardianPersonOption[], Error>({
    queryKey: ["people", "guardian", search],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await api.GET("/api/people", {
        params: { query: { kind: "guardian", search } },
      });
      if (error || !data) throw new Error("Failed to load guardians.");
      return data as unknown as GuardianPersonOption[];
    },
  });

  // Hide guardians that already belong to THIS family — they can't be
  // linked twice (the backend would 409). Surfacing them in the
  // search results would just look broken.
  const baseOptions: GuardianEntry[] = (people.data ?? [])
    // Per product call: only show existing people already on this
    // family. The dialog's search acts as a roster-find tool; the
    // only way to add a brand-new person is the "+ Add new" path.
    // Linking someone from another family isn't reachable from here.
    .filter((p) => !!familyId && p.family_id === familyId)
    .map((p) => ({ kind: "person", person: p }));

  const link = useMutation({
    mutationFn: async (personId: string) => {
      if (!familyId) throw new Error("No family selected.");
      const { error } = await api.POST(
        "/api/families/{family_id}/parents",
        {
          params: { path: { family_id: familyId } },
          body: { person_id: personId } as never,
        },
      );
      if (error) {
        const msg =
          (error as { detail?: string } | undefined)?.detail ??
          "Failed to link guardian.";
        throw new Error(msg);
      }
    },
    onSuccess: () => {
      snackbar.show("Guardian added");
      onCreated();
    },
    onError: (e: Error) => snackbar.show(e.message, "error"),
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!familyId) throw new Error("No family selected.");
      const { error } = await api.POST(
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
      if (error) {
        const msg =
          (error as { detail?: string } | undefined)?.detail ??
          "Failed to add guardian.";
        throw new Error(msg);
      }
    },
    onSuccess: () => {
      snackbar.show("Guardian added");
      onCreated();
    },
    onError: (e: Error) => snackbar.show(e.message, "error"),
  });

  // When the user picks "+ Add new" with typed text, prefill the
  // form by splitting on the first whitespace so a single-token name
  // becomes the first name (and the user can fill the rest).
  const startCreating = (label: string) => {
    const [first, ...rest] = label.trim().split(/\s+/);
    setFirstName(first ?? "");
    setLastName(rest.join(" "));
    setCreating(true);
    setPicked(null);
  };

  const personLabel = (p: GuardianPersonOption) =>
    `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "(no name)";

  const pending = link.isPending || create.isPending;
  // Picked rows are always in-family (the filter ensures it), so
  // submitting them would 409 on the backend. Only the "+ Add new"
  // path is a real add; submit is gated on that.
  const canSubmit =
    !!familyId &&
    !pending &&
    creating &&
    (firstName.trim() !== "" || lastName.trim() !== "");

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Add guardian</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Box>
            <Typography
              variant="body2"
              sx={{ mb: 0.5, color: "text.secondary", fontWeight: 500 }}
            >
              Search existing guardians
            </Typography>
            <Autocomplete<GuardianEntry, false, false, false>
              size="small"
              options={baseOptions}
              loading={people.isPending}
              value={picked ? { kind: "person", person: picked } : null}
              inputValue={search}
              onInputChange={(_e, v, reason) => {
                if (reason !== "reset") setSearch(v);
              }}
              onChange={(_e, entry) => {
                if (!entry) {
                  setPicked(null);
                  return;
                }
                if (entry.kind === "person") {
                  setPicked(entry.person);
                  setCreating(false);
                  setSearch(personLabel(entry.person));
                  return;
                }
                startCreating(entry.label);
              }}
              getOptionLabel={(entry) =>
                entry.kind === "person" ? personLabel(entry.person) : entry.label
              }
              isOptionEqualToValue={(a, b) =>
                a.kind === "person" &&
                b.kind === "person" &&
                a.person.id === b.person.id
              }
              filterOptions={(opts, state) => {
                const filtered = filterGuardians(opts, state);
                const q = state.inputValue.trim();
                if (q) filtered.push({ kind: "add", label: q });
                return filtered;
              }}
              renderOption={(props, entry) => {
                if (entry.kind === "add") {
                  return (
                    <li {...props} key="__add__">
                      <Typography variant="body2" color="primary">
                        + Add "{entry.label}" as a new guardian
                      </Typography>
                    </li>
                  );
                }
                const p = entry.person;
                return (
                  <li {...props} key={p.id}>
                    <Stack spacing={0.25} sx={{ py: 0.25 }}>
                      <Box component="span" sx={{ fontWeight: 500 }}>
                        {personLabel(p)}
                      </Box>
                      <Box
                        component="span"
                        sx={{ color: "text.secondary", fontSize: 12 }}
                      >
                        {p.email && <span>{p.email}</span>}
                        {p.email && p.phone && <span> · </span>}
                        {p.phone && <span>{p.phone}</span>}
                        {(p.email || p.phone) && p.family_household_name && (
                          <span> · </span>
                        )}
                        {p.family_household_name && (
                          <span>also on {p.family_household_name}</span>
                        )}
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

          {creating && (
            <>
              <Divider flexItem>or fill in a new guardian</Divider>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <LabeledField label="First name">
                  <TextField
                    size="small"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    fullWidth
                  />
                </LabeledField>
                <LabeledField label="Last name">
                  <TextField
                    size="small"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    fullWidth
                  />
                </LabeledField>
              </Stack>
              <LabeledField label="Phone">
                <TextField
                  size="small"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  fullWidth
                />
              </LabeledField>
              <LabeledField label="Email">
                <TextField
                  size="small"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  fullWidth
                />
              </LabeledField>
            </>
          )}

          {picked && (
            <Typography variant="caption" color="text.secondary">
              <strong>{personLabel(picked)}</strong> is already on this
              family. Clear the search and pick "+ Add new" to add
              someone else.
            </Typography>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button
          variant="contained"
          disabled={!canSubmit}
          onClick={() => {
            if (creating) create.mutate();
          }}
        >
          {pending ? "Adding…" : "Add"}
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
    <Accordion variant="outlined" disableGutters>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Stack
          direction="row"
          alignItems="center"
          spacing={1}
          sx={{ width: "100%" }}
        >
          <Typography variant="overline" color="text.secondary" sx={{ flex: 1 }}>
            Students
            {!loading && family && (
              <Box component="span" sx={{ ml: 1, color: "text.disabled", fontWeight: 400 }}>
                ({students.length})
              </Box>
            )}
          </Typography>
          <AddAction
            label="Add student"
            disabled={!family}
            onClick={() => setAddOpen(true)}
          />
        </Stack>
      </AccordionSummary>
      <AccordionDetails>
        {loading || !family ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
            <CircularProgress size={20} />
          </Box>
        ) : students.length === 0 ? (
          <Typography variant="body2" color="text.disabled">
            No students on file yet.
          </Typography>
        ) : (
          <Stack direction="row" useFlexGap flexWrap="wrap" sx={{ gap: 2 }}>
            {students.map((s) => (
              <Box key={s.id} sx={{ flex: "1 1 300px", maxWidth: 360 }}>
                <StudentCard student={s} />
              </Box>
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

/** Single student as a clickable card. Surfaces the basics the
 *  consultant uses at a glance (name, grade, DOB) plus a row of
 *  diagnosis chips when any flags are set. Click navigates to the
 *  student detail page for full editing — that page already owns
 *  every clinical field, so no inline drawer needed yet. */
function StudentCard({ student }: { student: StudentRow }) {
  const chips: string[] = [];
  if (student.has_504) chips.push("504");
  if (student.has_iep) chips.push("IEP");
  if (student.has_learning_disability) chips.push("LD");
  if (student.autism_level != null) chips.push(`Autism ${student.autism_level}`);
  if (student.has_adhd) chips.push("ADHD");
  if (student.has_intellectual_disability) chips.push("Intellectual");
  if (student.has_health_impairment) chips.push("Health");
  if (student.has_emotional_disturbance) chips.push("Emotional");

  return (
    <Card
      variant="outlined"
      sx={{
        height: "100%",
        transition: (t) => t.transitions.create(["border-color", "background-color"]),
        "&:hover": { borderColor: "primary.light", bgcolor: "action.hover" },
      }}
    >
      <CardActionArea
        component={RouterLink}
        to={`/students/${student.id}`}
        sx={{ height: "100%" }}
      >
        <CardContent>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            {student.name || "(no name)"}
          </Typography>
          <Stack
            direction="row"
            spacing={1.5}
            sx={{ color: "text.secondary", fontSize: 12, mt: 0.25 }}
          >
            {student.current_grade && (
              <Box component="span">Grade {student.current_grade}</Box>
            )}
            {student.dob && (
              <Box component="span">
                DOB {dayjs(student.dob).format("MMM D, YYYY")}
              </Box>
            )}
          </Stack>
          {chips.length > 0 && (
            <Stack direction="row" spacing={0.5} flexWrap="wrap" sx={{ mt: 1, gap: 0.5 }}>
              {chips.map((c) => (
                <Chip key={c} size="small" label={c} variant="outlined" />
              ))}
            </Stack>
          )}
        </CardContent>
      </CardActionArea>
    </Card>
  );
}

interface StudentPersonOption {
  id: string;
  first_name: string | null;
  last_name: string | null;
  current_grade: string | null;
  family_id: string | null;
  family_household_name: string | null;
}

type StudentEntry =
  | { kind: "person"; person: StudentPersonOption }
  | { kind: "add"; label: string };

const filterStudents = createFilterOptions<StudentEntry>({
  stringify: (entry) => {
    if (entry.kind === "add") return entry.label;
    const p = entry.person;
    return [
      p.first_name ?? "",
      p.last_name ?? "",
      p.family_household_name ?? "",
    ].join(" ");
  },
});

/** Two-stage dialog mirroring AddGuardianDialog. Search existing
 *  students by name first — handy when a sibling is already in the
 *  system on another family or no family. Picking links via
 *  person_id; "+ Add new" reveals the create form prefilled from the
 *  typed text. */
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
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<StudentPersonOption | null>(null);
  const [creating, setCreating] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dob, setDob] = useState<Dayjs | null>(null);
  const [grade, setGrade] = useState("");

  const people = useQuery<StudentPersonOption[], Error>({
    queryKey: ["people", "student", search],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await api.GET("/api/people", {
        params: { query: { kind: "student", search } },
      });
      if (error || !data) throw new Error("Failed to load students.");
      return data as unknown as StudentPersonOption[];
    },
  });

  // Hide students already on this family — backend would 409 on
  // re-linking, and seeing them here would just look broken.
  const baseOptions: StudentEntry[] = (people.data ?? [])
    // Per product call: only show existing people already on this
    // family. The dialog's search acts as a roster-find tool; the
    // only way to add a brand-new person is the "+ Add new" path.
    // Linking someone from another family isn't reachable from here.
    .filter((p) => !!familyId && p.family_id === familyId)
    .map((p) => ({ kind: "person", person: p }));

  const link = useMutation({
    mutationFn: async (personId: string) => {
      if (!familyId) throw new Error("No family selected.");
      const { error } = await api.POST(
        "/api/families/{family_id}/students",
        {
          params: { path: { family_id: familyId } },
          body: { person_id: personId } as never,
        },
      );
      if (error) {
        const msg =
          (error as { detail?: string } | undefined)?.detail ??
          "Failed to link student.";
        throw new Error(msg);
      }
    },
    onSuccess: () => {
      snackbar.show("Student added");
      onCreated();
    },
    onError: (e: Error) => snackbar.show(e.message, "error"),
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!familyId) throw new Error("No family selected.");
      const { error } = await api.POST(
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
      if (error) {
        const msg =
          (error as { detail?: string } | undefined)?.detail ??
          "Failed to add student.";
        throw new Error(msg);
      }
    },
    onSuccess: () => {
      snackbar.show("Student added");
      onCreated();
    },
    onError: (e: Error) => snackbar.show(e.message, "error"),
  });

  const startCreating = (label: string) => {
    const [first, ...rest] = label.trim().split(/\s+/);
    setFirstName(first ?? "");
    setLastName(rest.join(" "));
    setCreating(true);
    setPicked(null);
  };

  const personLabel = (p: StudentPersonOption) =>
    `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "(no name)";

  const pending = link.isPending || create.isPending;
  // Picked rows are always already on this family per the filter
  // above; only "+ Add new" produces a real add action.
  const canSubmit =
    !!familyId &&
    !pending &&
    creating &&
    !!firstName.trim() &&
    !!lastName.trim();

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Add student</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Box>
            <Typography
              variant="body2"
              sx={{ mb: 0.5, color: "text.secondary", fontWeight: 500 }}
            >
              Search existing students
            </Typography>
            <Autocomplete<StudentEntry, false, false, false>
              size="small"
              options={baseOptions}
              loading={people.isPending}
              value={picked ? { kind: "person", person: picked } : null}
              inputValue={search}
              onInputChange={(_e, v, reason) => {
                if (reason !== "reset") setSearch(v);
              }}
              onChange={(_e, entry) => {
                if (!entry) {
                  setPicked(null);
                  return;
                }
                if (entry.kind === "person") {
                  setPicked(entry.person);
                  setCreating(false);
                  setSearch(personLabel(entry.person));
                  return;
                }
                startCreating(entry.label);
              }}
              getOptionLabel={(entry) =>
                entry.kind === "person" ? personLabel(entry.person) : entry.label
              }
              isOptionEqualToValue={(a, b) =>
                a.kind === "person" &&
                b.kind === "person" &&
                a.person.id === b.person.id
              }
              filterOptions={(opts, state) => {
                const filtered = filterStudents(opts, state);
                const q = state.inputValue.trim();
                if (q) filtered.push({ kind: "add", label: q });
                return filtered;
              }}
              renderOption={(props, entry) => {
                if (entry.kind === "add") {
                  return (
                    <li {...props} key="__add__">
                      <Typography variant="body2" color="primary">
                        + Add "{entry.label}" as a new student
                      </Typography>
                    </li>
                  );
                }
                const p = entry.person;
                return (
                  <li {...props} key={p.id}>
                    <Stack spacing={0.25} sx={{ py: 0.25 }}>
                      <Box component="span" sx={{ fontWeight: 500 }}>
                        {personLabel(p)}
                      </Box>
                      <Box
                        component="span"
                        sx={{ color: "text.secondary", fontSize: 12 }}
                      >
                        {p.current_grade && <span>Grade {p.current_grade}</span>}
                        {p.current_grade && p.family_household_name && <span> · </span>}
                        {p.family_household_name && (
                          <span>also on {p.family_household_name}</span>
                        )}
                      </Box>
                    </Stack>
                  </li>
                );
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  autoFocus
                  placeholder="Name"
                />
              )}
            />
          </Box>

          {creating && (
            <>
              <Divider flexItem>or fill in a new student</Divider>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <LabeledField label="First name" required>
                  <TextField
                    required
                    size="small"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    fullWidth
                  />
                </LabeledField>
                <LabeledField label="Last name" required>
                  <TextField
                    required
                    size="small"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    fullWidth
                  />
                </LabeledField>
              </Stack>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <LabeledField label="Date of birth">
                  <DatePicker
                    value={dob}
                    onChange={(v) => setDob(v)}
                    openTo="year"
                    views={["year", "month", "day"]}
                    slotProps={{ textField: { size: "small", fullWidth: true } }}
                  />
                </LabeledField>
                <LabeledField label="Current grade">
                  <TextField
                    size="small"
                    placeholder='e.g. "8th"'
                    value={grade}
                    onChange={(e) => setGrade(e.target.value)}
                    fullWidth
                  />
                </LabeledField>
              </Stack>
              <Typography variant="caption" color="text.disabled">
                Diagnoses, current school, and other clinical fields are
                edited from the student detail page once the row exists.
              </Typography>
            </>
          )}

          {picked && (
            <Typography variant="caption" color="text.secondary">
              <strong>{personLabel(picked)}</strong> is already on this
              family. Clear the search and pick "+ Add new" to add
              someone else.
            </Typography>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button
          variant="contained"
          disabled={!canSubmit}
          onClick={() => {
            if (creating) create.mutate();
          }}
        >
          {pending ? "Adding…" : "Add"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
