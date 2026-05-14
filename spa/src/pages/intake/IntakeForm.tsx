import { useEffect, useState } from "react";
import {
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
  Grid,
  Link as MuiLink,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import dayjs from "dayjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link as RouterLink, useParams } from "react-router-dom";

import { api } from "../../api/client";
import { PageHeader } from "../../components/PageHeader";
import { RichTextEditor } from "../../components/RichTextEditor";
import { useSnackbar } from "../../components/Snackbar";

// /api/intakes/:id returns a plain dict; hand-typed here.
interface Intake {
  id: string;
  family_id: string;
  intake_date: string;
  consultant_id: string | null;
  notes: string | null;
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

interface FamilyDetail {
  id: string;
  household_name: string;
  parents: GuardianRow[];
}

/** Intake detail page at /intakes/:id. The family is locked once the
 *  intake exists; everything else auto-saves on blur. New intakes are
 *  created from the IntakesList or the home page via the family
 *  picker modal, so by the time we land here the row already exists. */
export function IntakeForm() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const snackbar = useSnackbar();

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
        subtitle={`Intake date ${dayjs(intake.data.intake_date).format("MMM D, YYYY")} — changes save automatically.`}
        breadcrumbs={
          <Breadcrumbs>
            <MuiLink component={RouterLink} to="/intakes" color="inherit" underline="hover">
              Intakes
            </MuiLink>
            <Typography color="text.primary">
              {family.data?.household_name ?? "…"}
            </Typography>
          </Breadcrumbs>
        }
      />

      <Grid container spacing={2} alignItems="stretch">
        <Grid item xs={12} md={6}>
          <Stack spacing={2}>
            <FamilySummary family={family.data ?? null} loading={family.isPending} />
            <GuardiansSection family={family.data ?? null} loading={family.isPending} />
            {/* Future left-column sections (student, etc.) drop in here. */}
          </Stack>
        </Grid>
        <Grid item xs={12} md={6}>
          <IntakeNotesSection
            initial={intake.data.notes ?? ""}
            onCommit={(html) => patch.mutate({ notes: html || null })}
          />
        </Grid>
      </Grid>
    </Stack>
  );
}

// ---- Family summary (read-only) -------------------------------------------

function FamilySummary({
  family,
  loading,
}: {
  family: FamilyDetail | null;
  loading: boolean;
}) {
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Typography variant="overline" color="text.secondary" sx={{ display: "block", mb: 1 }}>
        Family
      </Typography>
      {loading || !family ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 1 }}>
          <CircularProgress size={20} />
        </Box>
      ) : (
        <Typography variant="body2">
          <MuiLink
            component={RouterLink}
            to={`/families/${family.id}`}
            underline="hover"
          >
            {family.household_name}
          </MuiLink>
        </Typography>
      )}
    </Paper>
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
    <Paper variant="outlined" sx={{ p: 2, height: "100%", display: "flex", flexDirection: "column" }}>
      <Typography variant="overline" color="text.secondary" sx={{ display: "block", mb: 1 }}>
        Intake notes
      </Typography>
      <Box
        sx={{ flex: 1, display: "flex" }}
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
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack direction="row" alignItems="baseline" spacing={1} sx={{ mb: 1 }}>
        <Typography variant="overline" color="text.secondary" sx={{ flex: 1 }}>
          Family guardians
        </Typography>
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
    </Paper>
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
