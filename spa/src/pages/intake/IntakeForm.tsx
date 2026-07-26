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
  IconButton,
  Link as MuiLink,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { DatePicker } from "@mui/x-date-pickers";
import dayjs, { type Dayjs } from "dayjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link as RouterLink, useNavigate, useParams } from "react-router-dom";

import { api } from "../../api/client";
import { LabeledField } from "../../components/LabeledField";
import { PageHeader } from "../../components/PageHeader";
import { RichTextEditor } from "../../components/RichTextEditor";
import { SectionPanel } from "../../components/SectionPanel";
import { useSnackbar } from "../../components/Snackbar";
import { ParentDrawer } from "../families/ParentDrawer";
import type { ParentDrawerTarget } from "../families/ParentDrawer";
import { StudentDrawer } from "../students/StudentDrawer";

import { FamilyContextCard } from "./FamilyContextCard";
import { FitOutcomeCard } from "./FitOutcomeCard";
import { IntakeHeaderStrip } from "./IntakeHeaderStrip";
import { StudentDiscoveryCard } from "./StudentDiscoveryCard";
import type {
  EngagementTypeOption,
  IntakeDetail,
  IntakeStudent,
} from "./intakeTypes";

// Re-export the page-level types from intakeTypes.ts under the local
// names the existing helper sub-components (GuardiansSection,
// StudentsSection, dialogs) read. Saves churning each sub-component's
// internal types.
type Intake = IntakeDetail;
type GuardianRow = IntakeDetail["guardians"][number];
type StudentRow = IntakeStudent;

interface FamilyDetail {
  id: string;
  household_name: string;
  parents: GuardianRow[];
  students: StudentRow[];
}

/** Intake detail page at /intakes/:id. The family is locked once the
 *  intake exists; everything else auto-saves on blur. The Discovery
 *  layout: header strip, family context card, guardian + student
 *  rosters (accordions), per-student discovery cards, fit/outcome
 *  decision card, and the bottom intake-notes catch-all. */
export function IntakeForm() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const snackbar = useSnackbar();
  const navigate = useNavigate();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
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

  // Engagement type catalog — drives the recommended-type picker in the
  // Fit card. Cached across all intake pages; small enough that we
  // accept the indirection over hardcoding.
  const engagementTypes = useQuery<EngagementTypeOption[], Error>({
    queryKey: ["engagement-types"],
    queryFn: async () => {
      const res = await fetch("/api/engagement-types", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load engagement types.");
      const rows = (await res.json()) as { code: string; label: string }[];
      return rows.map(({ code, label }) => ({ code, label }));
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

  const patchStudent = useMutation({
    mutationFn: async ({
      personId,
      body,
    }: {
      personId: string;
      body: Partial<IntakeStudent>;
    }) => {
      if (!id) return;
      const res = await fetch(
        `/api/intakes/${id}/students/${personId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(
          (json as { detail?: string }).detail ?? "Save failed.",
        );
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["intakes", id] });
    },
    onError: (e: Error) => snackbar.show(e.message, "error"),
  });

  const convert = useMutation({
    mutationFn: async () => {
      if (!id) return null;
      const res = await fetch(`/api/intakes/${id}/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: "{}",
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(
          (json as { detail?: string }).detail ?? "Convert failed.",
        );
      }
      return (await res.json()) as { engagement_ids: string[] };
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["intakes", id] });
      qc.invalidateQueries({ queryKey: ["engagements", "list"] });
      if (result && result.engagement_ids.length === 1) {
        snackbar.show("Engagement created.");
        navigate(`/engagements/${result.engagement_ids[0]}`);
      } else if (result) {
        snackbar.show(`${result.engagement_ids.length} engagements created.`);
      }
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

  return (
    <Stack spacing={3}>
      <PageHeader
        title="Intake"
        subtitle="Changes save automatically."
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

      <IntakeHeaderStrip
        intakeDate={intake.data.intake_date}
        referralSource={intake.data.referral_source}
        outcome={intake.data.outcome}
        onIntakeDateChange={(v) => patch.mutate({ intake_date: v })}
        onReferralSourceChange={(v) => patch.mutate({ referral_source: v })}
      />

      {/* Roster accordions — the consultant picks who's on this
          intake from the family. Sits above Family context because
          discovery starts with "who's at the table" before "what
          they're trying to do". */}
      <GuardiansSection
        intakeId={intake.data.id}
        familyId={intake.data.family_id}
        intakeGuardians={intake.data.guardians ?? []}
        familyGuardians={family.data?.parents ?? []}
        loading={family.isPending}
      />
      <StudentsSection
        intakeId={intake.data.id}
        familyId={intake.data.family_id}
        intakeStudents={intake.data.students ?? []}
        familyStudents={family.data?.students ?? []}
        loading={family.isPending}
      />

      <FamilyContextCard
        intake={intake.data}
        onPatch={(body) => patch.mutate(body as Record<string, unknown>)}
      />

      {(intake.data.students ?? []).map((s) => (
        <StudentDiscoveryCard
          key={s.id}
          student={s}
          onPatch={(body) => patchStudent.mutate({ personId: s.id, body })}
        />
      ))}

      <FitOutcomeCard
        intake={intake.data}
        engagementTypes={engagementTypes.data ?? []}
        onPatchIntake={(body) => patch.mutate(body as Record<string, unknown>)}
        onPatchStudent={(personId, body) =>
          patchStudent.mutate({ personId, body })
        }
        onConvert={async () => {
          try {
            return await convert.mutateAsync();
          } catch {
            return null;
          }
        }}
        converting={convert.isPending}
      />

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
    <SectionPanel title="Intake notes" titleVariant="overline">
      <Box
        sx={{ display: "flex", p: 2 }}
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
    </SectionPanel>
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
  intakeId,
  familyId,
  intakeGuardians,
  familyGuardians,
  loading,
}: {
  intakeId: string;
  familyId: string;
  intakeGuardians: GuardianRow[];
  familyGuardians: GuardianRow[];
  loading: boolean;
}) {
  const qc = useQueryClient();
  const snackbar = useSnackbar();
  const [addOpen, setAddOpen] = useState(false);
  const [drawerGuardian, setDrawerGuardian] = useState<ParentDrawerTarget | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["intakes", intakeId] });
    qc.invalidateQueries({ queryKey: ["families", "intake-detail", familyId] });
    qc.invalidateQueries({ queryKey: ["families", "intake-picker"] });
  };

  const unlink = useMutation({
    mutationFn: async (personId: string) => {
      const { error } = await api.DELETE(
        "/api/intakes/{intake_id}/guardians/{person_id}",
        {
          params: { path: { intake_id: intakeId, person_id: personId } as never },
        },
      );
      if (error) {
        const msg = (error as { detail?: string }).detail ?? "Remove failed.";
        throw new Error(msg);
      }
    },
    onSuccess: () => {
      snackbar.show("Removed from intake");
      invalidate();
    },
    onError: (e: Error) => snackbar.show(e.message, "error"),
  });

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
            {!loading && (
              <Box component="span" sx={{ ml: 1, color: "text.disabled", fontWeight: 400 }}>
                ({intakeGuardians.length})
              </Box>
            )}
          </Typography>
          <AddAction
            label="Add guardian"
            onClick={() => setAddOpen(true)}
          />
        </Stack>
      </AccordionSummary>
      <AccordionDetails>
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
            <CircularProgress size={20} />
          </Box>
        ) : intakeGuardians.length === 0 ? (
          <Typography variant="body2" color="text.disabled">
            No guardians on this intake yet.
          </Typography>
        ) : (
          <Stack direction="row" useFlexGap flexWrap="wrap" sx={{ gap: 2 }}>
            {intakeGuardians.map((g) => (
              <Box key={g.id} sx={{ flex: "1 1 300px", maxWidth: 360 }}>
                <GuardianCard
                  guardian={g}
                  onOpen={() => setDrawerGuardian(g)}
                  onRemove={() => unlink.mutate(g.id)}
                  removing={unlink.isPending}
                />
              </Box>
            ))}
          </Stack>
        )}

        <AddGuardianDialog
          key={addOpen ? `add-${intakeId}` : "closed"}
          open={addOpen}
          intakeId={intakeId}
          familyId={familyId}
          familyGuardians={familyGuardians}
          intakeGuardians={intakeGuardians}
          onClose={() => setAddOpen(false)}
          onCreated={() => {
            setAddOpen(false);
            invalidate();
          }}
        />
        <ParentDrawer
          open={!!drawerGuardian}
          parent={
            drawerGuardian
              ? intakeGuardians.find((g) => g.id === drawerGuardian.id) ?? drawerGuardian
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
  onRemove,
  removing,
}: {
  guardian: GuardianRow;
  onOpen: () => void;
  onRemove?: () => void;
  removing?: boolean;
}) {
  const role = guardian.role && guardian.role !== "other" ? guardian.role : null;
  return (
    <Card
      variant="outlined"
      sx={{
        height: "100%",
        position: "relative",
        transition: (t) => t.transitions.create(["border-color", "background-color"]),
        "&:hover": { borderColor: "primary.light", bgcolor: "action.hover" },
      }}
    >
      {onRemove && (
        <Tooltip title="Remove from intake">
          <IconButton
            size="small"
            aria-label="Remove from intake"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onRemove();
            }}
            disabled={removing}
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
        </Tooltip>
      )}
      <CardActionArea onClick={onOpen} sx={{ height: "100%" }}>
        <CardContent>
          {(guardian.is_primary_contact || guardian.is_billing_contact || role) && (
            <Stack direction="row" spacing={0.5} sx={{ mb: 0.75, pr: 4 }}>
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
          )}
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

type GuardianEntry =
  | { kind: "guardian"; guardian: GuardianRow; alreadyOnIntake: boolean }
  | { kind: "add"; label: string };

const filterGuardians = createFilterOptions<GuardianEntry>({
  stringify: (entry) =>
    entry.kind === "add"
      ? entry.label
      : [entry.guardian.name, entry.guardian.email ?? ""].join(" "),
});

/** Add guardian to this intake. Two paths:
 *  - Pick an existing family guardian who isn't on the intake yet,
 *    → POST /api/intakes/:id/guardians.
 *  - "+ Add new": create on the family (POST /api/families/:id/parents)
 *    AND immediately link to the intake. The family roster grows + the
 *    new person lands on this intake in one click. */
function AddGuardianDialog({
  open,
  intakeId,
  familyId,
  familyGuardians,
  intakeGuardians,
  onClose,
  onCreated,
}: {
  open: boolean;
  intakeId: string;
  familyId: string;
  familyGuardians: GuardianRow[];
  intakeGuardians: GuardianRow[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const snackbar = useSnackbar();
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<GuardianRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  // Show the family's full guardian roster; we mark already-on-intake
  // entries as disabled so the user sees them but can't re-link.
  // Hiding them silently made the search look broken when the user
  // typed a name that matched someone already on the intake.
  const onIntake = new Set(intakeGuardians.map((g) => g.id));
  const baseOptions: GuardianEntry[] = familyGuardians.map((g) => ({
    kind: "guardian",
    guardian: g,
    alreadyOnIntake: onIntake.has(g.id),
  }));

  const linkOnly = useMutation({
    mutationFn: async (personId: string) => {
      const { error } = await api.POST(
        "/api/intakes/{intake_id}/guardians",
        {
          params: { path: { intake_id: intakeId } },
          body: { person_id: personId } as never,
        },
      );
      if (error) {
        const msg = (error as { detail?: string }).detail ?? "Failed to add to intake.";
        throw new Error(msg);
      }
    },
    onSuccess: () => {
      snackbar.show("Guardian added to intake");
      onCreated();
    },
    onError: (e: Error) => snackbar.show(e.message, "error"),
  });

  const createAndLink = useMutation({
    mutationFn: async () => {
      const created = await api.POST(
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
      if (created.error || !created.data) {
        const msg =
          (created.error as { detail?: string } | undefined)?.detail ??
          "Failed to add guardian.";
        throw new Error(msg);
      }
      const newPerson = created.data as unknown as { id: string };
      const linked = await api.POST(
        "/api/intakes/{intake_id}/guardians",
        {
          params: { path: { intake_id: intakeId } },
          body: { person_id: newPerson.id } as never,
        },
      );
      if (linked.error) {
        const msg =
          (linked.error as { detail?: string } | undefined)?.detail ??
          "Created the guardian but failed to link them to the intake.";
        throw new Error(msg);
      }
    },
    onSuccess: () => {
      snackbar.show("Guardian added");
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

  const pending = linkOnly.isPending || createAndLink.isPending;
  const canSubmit =
    !pending &&
    (picked
      ? true
      : creating && (firstName.trim() !== "" || lastName.trim() !== ""));

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Add guardian</DialogTitle>
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
            <Autocomplete<GuardianEntry, false, false, false>
              size="small"
              options={baseOptions}
              value={picked ? { kind: "guardian", guardian: picked, alreadyOnIntake: false } : null}
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
                entry.kind === "guardian" && entry.alreadyOnIntake
              }
              isOptionEqualToValue={(a, b) =>
                a.kind === "guardian" &&
                b.kind === "guardian" &&
                a.guardian.id === b.guardian.id
              }
              filterOptions={(opts, state) => {
                const filtered = filterGuardians(opts, state);
                // Always offer "+ Add new" at the bottom, even with no
                // typed text — when the family roster is exhausted
                // there's no other entry to act on, and gating on
                // input was hiding the only way forward.
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
                        {entry.alreadyOnIntake && (
                          <Chip
                            size="small"
                            label="on intake"
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
              {/* Divider only makes sense as a separator when the
                  search is still above; in create-only mode it's
                  redundant. */}
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
              Linking <strong>{picked.name}</strong> to this intake. They
              already exist on the family — this just attaches them to
              the meeting.
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
            if (picked) linkOnly.mutate(picked.id);
            else if (creating) createAndLink.mutate();
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
  intakeId,
  familyId,
  intakeStudents,
  familyStudents,
  loading,
}: {
  intakeId: string;
  familyId: string;
  intakeStudents: StudentRow[];
  familyStudents: StudentRow[];
  loading: boolean;
}) {
  const qc = useQueryClient();
  const snackbar = useSnackbar();
  const [addOpen, setAddOpen] = useState(false);
  const [drawerId, setDrawerId] = useState<string | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["intakes", intakeId] });
    qc.invalidateQueries({ queryKey: ["families", "intake-detail", familyId] });
    qc.invalidateQueries({ queryKey: ["families", "intake-picker"] });
  };

  const unlink = useMutation({
    mutationFn: async (personId: string) => {
      const { error } = await api.DELETE(
        "/api/intakes/{intake_id}/students/{person_id}",
        {
          params: { path: { intake_id: intakeId, person_id: personId } as never },
        },
      );
      if (error) {
        const msg = (error as { detail?: string }).detail ?? "Remove failed.";
        throw new Error(msg);
      }
    },
    onSuccess: () => {
      snackbar.show("Removed from intake");
      invalidate();
    },
    onError: (e: Error) => snackbar.show(e.message, "error"),
  });

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
            {!loading && (
              <Box component="span" sx={{ ml: 1, color: "text.disabled", fontWeight: 400 }}>
                ({intakeStudents.length})
              </Box>
            )}
          </Typography>
          <AddAction
            label="Add student"
            onClick={() => setAddOpen(true)}
          />
        </Stack>
      </AccordionSummary>
      <AccordionDetails>
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
            <CircularProgress size={20} />
          </Box>
        ) : intakeStudents.length === 0 ? (
          <Typography variant="body2" color="text.disabled">
            No students on this intake yet.
          </Typography>
        ) : (
          <Stack direction="row" useFlexGap flexWrap="wrap" sx={{ gap: 2 }}>
            {intakeStudents.map((s) => (
              <Box key={s.id} sx={{ flex: "1 1 300px", maxWidth: 360 }}>
                <StudentCard
                  student={s}
                  onOpen={() => setDrawerId(s.id)}
                  onRemove={() => unlink.mutate(s.id)}
                  removing={unlink.isPending}
                />
              </Box>
            ))}
          </Stack>
        )}

        <AddStudentDialog
          key={addOpen ? `add-${intakeId}` : "closed"}
          open={addOpen}
          intakeId={intakeId}
          familyId={familyId}
          familyStudents={familyStudents}
          intakeStudents={intakeStudents}
          onClose={() => setAddOpen(false)}
          onCreated={() => {
            setAddOpen(false);
            invalidate();
          }}
        />
        <StudentDrawer
          open={!!drawerId}
          studentId={drawerId}
          onClose={() => setDrawerId(null)}
          onChanged={invalidate}
          onRemoved={invalidate}
        />
      </AccordionDetails>
    </Accordion>
  );
}

/** Single student as a clickable card. Surfaces the basics the
 *  consultant uses at a glance (name, grade, DOB) plus a row of
 *  diagnosis chips when any flags are set. Click opens the
 *  StudentDrawer for inline editing without leaving the intake. */
function StudentCard({
  student,
  onOpen,
  onRemove,
  removing,
}: {
  student: StudentRow;
  onOpen: () => void;
  onRemove?: () => void;
  removing?: boolean;
}) {
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
        position: "relative",
        transition: (t) => t.transitions.create(["border-color", "background-color"]),
        "&:hover": { borderColor: "primary.light", bgcolor: "action.hover" },
      }}
    >
      {onRemove && (
        <Tooltip title="Remove from intake">
          <IconButton
            size="small"
            aria-label="Remove from intake"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onRemove();
            }}
            disabled={removing}
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
        </Tooltip>
      )}
      <CardActionArea onClick={onOpen} sx={{ height: "100%" }}>
        <CardContent>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, pr: 4 }}>
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

type StudentEntry =
  | { kind: "student"; student: StudentRow; alreadyOnIntake: boolean }
  | { kind: "add"; label: string };

const filterStudents = createFilterOptions<StudentEntry>({
  stringify: (entry) =>
    entry.kind === "add" ? entry.label : entry.student.name,
});

/** Add student to this intake. Pick from family roster (minus those
 *  already on this intake) → POST /api/intakes/:id/students. Or
 *  "+ Add new" → create on family + auto-link to intake. */
function AddStudentDialog({
  open,
  intakeId,
  familyId,
  familyStudents,
  intakeStudents,
  onClose,
  onCreated,
}: {
  open: boolean;
  intakeId: string;
  familyId: string;
  familyStudents: StudentRow[];
  intakeStudents: StudentRow[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const snackbar = useSnackbar();
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<StudentRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dob, setDob] = useState<Dayjs | null>(null);
  const [grade, setGrade] = useState("");

  // Mirror the guardian dialog: show all family students; mark
  // already-on-intake entries as disabled so the user understands
  // why they can't be picked instead of seeing an empty list.
  const onIntake = new Set(intakeStudents.map((s) => s.id));
  const baseOptions: StudentEntry[] = familyStudents.map((s) => ({
    kind: "student",
    student: s,
    alreadyOnIntake: onIntake.has(s.id),
  }));

  const linkOnly = useMutation({
    mutationFn: async (personId: string) => {
      const { error } = await api.POST(
        "/api/intakes/{intake_id}/students",
        {
          params: { path: { intake_id: intakeId } },
          body: { person_id: personId } as never,
        },
      );
      if (error) {
        const msg = (error as { detail?: string }).detail ?? "Failed to add to intake.";
        throw new Error(msg);
      }
    },
    onSuccess: () => {
      snackbar.show("Student added to intake");
      onCreated();
    },
    onError: (e: Error) => snackbar.show(e.message, "error"),
  });

  const createAndLink = useMutation({
    mutationFn: async () => {
      const created = await api.POST(
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
      if (created.error || !created.data) {
        const msg =
          (created.error as { detail?: string } | undefined)?.detail ??
          "Failed to add student.";
        throw new Error(msg);
      }
      const newPerson = created.data as unknown as { id: string };
      const linked = await api.POST(
        "/api/intakes/{intake_id}/students",
        {
          params: { path: { intake_id: intakeId } },
          body: { person_id: newPerson.id } as never,
        },
      );
      if (linked.error) {
        const msg =
          (linked.error as { detail?: string } | undefined)?.detail ??
          "Created the student but failed to link them to the intake.";
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

  const pending = linkOnly.isPending || createAndLink.isPending;
  const canSubmit =
    !pending &&
    (picked
      ? true
      : creating && !!firstName.trim() && !!lastName.trim());

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Add student</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {!creating && (
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
              value={picked ? { kind: "student", student: picked, alreadyOnIntake: false } : null}
              inputValue={search}
              onInputChange={(_e, v, reason) => {
                if (reason !== "reset") setSearch(v);
              }}
              onChange={(_e, entry) => {
                if (!entry) {
                  setPicked(null);
                  return;
                }
                if (entry.kind === "student") {
                  setPicked(entry.student);
                  setCreating(false);
                  setSearch(entry.student.name);
                  return;
                }
                startCreating(entry.label);
              }}
              getOptionLabel={(entry) =>
                entry.kind === "student" ? entry.student.name : entry.label
              }
              getOptionDisabled={(entry) =>
                entry.kind === "student" && entry.alreadyOnIntake
              }
              isOptionEqualToValue={(a, b) =>
                a.kind === "student" &&
                b.kind === "student" &&
                a.student.id === b.student.id
              }
              filterOptions={(opts, state) => {
                const filtered = filterStudents(opts, state);
                // Same as guardians: always offer "+ Add new" at the
                // bottom so an empty roster doesn't leave the user
                // stuck.
                filtered.push({ kind: "add", label: state.inputValue.trim() });
                return filtered;
              }}
              renderOption={(props, entry) => {
                if (entry.kind === "add") {
                  return (
                    <li {...props} key="__add__">
                      <Typography variant="body2" color="primary">
                        {entry.label
                          ? `+ Add "${entry.label}" as a new student`
                          : "+ Add a new student"}
                      </Typography>
                    </li>
                  );
                }
                const s = entry.student;
                return (
                  <li {...props} key={s.id}>
                    <Stack spacing={0.25} sx={{ py: 0.25, width: "100%" }}>
                      <Stack
                        direction="row"
                        alignItems="center"
                        spacing={1}
                        sx={{ width: "100%" }}
                      >
                        <Box component="span" sx={{ fontWeight: 500, flex: 1 }}>
                          {s.name}
                        </Box>
                        {entry.alreadyOnIntake && (
                          <Chip
                            size="small"
                            label="on intake"
                            variant="outlined"
                            sx={{ height: 20 }}
                          />
                        )}
                      </Stack>
                      <Box
                        component="span"
                        sx={{ color: "text.secondary", fontSize: 12 }}
                      >
                        {s.current_grade && <span>Grade {s.current_grade}</span>}
                        {s.current_grade && s.dob && <span> · </span>}
                        {s.dob && (
                          <span>DOB {dayjs(s.dob).format("MMM D, YYYY")}</span>
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
          )}

          {creating && (
            <>
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
              Linking <strong>{picked.name}</strong> to this intake. They
              already exist on the family — this just attaches them to
              the meeting.
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
            if (picked) linkOnly.mutate(picked.id);
            else if (creating) createAndLink.mutate();
          }}
        >
          {pending ? "Adding…" : "Add"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
