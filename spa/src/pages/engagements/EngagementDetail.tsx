import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Link as MuiLink,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import PauseCircleOutlineIcon from "@mui/icons-material/PauseCircleOutline";
import ReplayIcon from "@mui/icons-material/Replay";
import dayjs from "dayjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link as RouterLink, useNavigate, useParams } from "react-router-dom";

import { api } from "../../api/client";
import { PageHeader } from "../../components/PageHeader";
import { useSnackbar } from "../../components/Snackbar";
import { StatusChip } from "../../components/StatusChip";
import { useEngagementTypes } from "../../hooks/useEngagementTypes";
import { ActivitiesCard } from "./ActivitiesCard";
import { BillingCard } from "./BillingCard";
import { ContractCard } from "./ContractCard";
import { ExpensesCard } from "./ExpensesCard";
import { GuardiansCard } from "./GuardiansCard";
import { IntakeContextCard, type IntakeSnapshot } from "./IntakeContextCard";
import { NotesCard } from "./NotesCard";
import { RequirementsCard } from "./RequirementsCard";
import { TimeEntriesCard } from "./TimeEntriesCard";

// /api/engagements/{id} returns a plain dict (no OpenAPI response_model).
// Hand-typed here for the bits we render.
interface EngagementDetail {
  id: string;
  engagement_type: string;
  status: string;
  start_date: string | null;
  target_end_date: string | null;
  default_hourly_rate: string | null;
  notes: string | null;
  intake_snapshot: IntakeSnapshot | null;
  family: { id: string; household_name: string };
  student: {
    id: string;
    name: string;
    dob: string | null;
    current_grade: string | null;
  } | null;
  lead_consultant: { id: string; name: string } | null;
  counts: {
    notes: number;
    time_entries: number;
    school_visits: number;
    recommendations: number;
    invoices: number;
    tasks_total: number;
    tasks_completed: number;
    tasks_na: number;
  };
}

export function EngagementDetail() {
  const { id } = useParams<{ id: string }>();
  const { labelFor: labelForType } = useEngagementTypes();

  const engagement = useQuery<EngagementDetail, Error>({
    queryKey: ["engagements", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error, response } = await api.GET(
        "/api/engagements/{engagement_id}",
        { params: { path: { engagement_id: id! } } },
      );
      if (response.status === 404) throw new Error("Engagement not found.");
      if (error || !data) throw new Error("Failed to load engagement.");
      return data as unknown as EngagementDetail;
    },
  });

  if (engagement.error) {
    return <Alert severity="error">{engagement.error.message}</Alert>;
  }
  if (engagement.isPending || !engagement.data) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Stack spacing={3}>
      <PageHeader
        title={
          <Stack
            direction="row"
            alignItems="center"
            spacing={1.5}
            sx={{ flexWrap: "wrap" }}
          >
            <span>{labelForType(engagement.data.engagement_type)}</span>
            <StatusChip
              size="small"
              label={engagement.data.status.replace(/_/g, " ")}
              tone={
                engagement.data.status === "in_progress"
                  ? "info"
                  : engagement.data.status === "completed"
                    ? "success"
                    : "neutral"
              }
              variant="soft"
            />
          </Stack>
        }
        breadcrumbs={
          <>
            <MuiLink component={RouterLink} to="/families" color="inherit" underline="hover">
              Families
            </MuiLink>
            <MuiLink
              component={RouterLink}
              to={`/families/${engagement.data.family.id}`}
              color="inherit"
              underline="hover"
            >
              {engagement.data.family.household_name}
            </MuiLink>
            <Typography color="text.primary">
              {labelForType(engagement.data.engagement_type)}
            </Typography>
          </>
        }
        actions={<EngagementActionsMenu engagement={engagement.data} />}
      />

      <HeaderStrip engagement={engagement.data} />

      <GuardiansCard familyId={engagement.data.family.id} />

      <IntakeContextCard snapshot={engagement.data.intake_snapshot} />

      <ContractCard engagementId={id!} />

      <RequirementsCard engagementId={id!} />

      <ActivitiesCard engagementId={id!} />

      <BillingCard
        engagementId={id!}
        defaultHourlyRate={engagement.data.default_hourly_rate}
      />

      <TimeEntriesCard engagementId={id!} />

      <ExpensesCard engagementId={id!} />

      <NotesCard engagementId={id!} />
    </Stack>
  );
}

function EngagementActionsMenu({ engagement }: { engagement: EngagementDetail }) {
  const qc = useQueryClient();
  const snackbar = useSnackbar();
  const navigate = useNavigate();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const setStatus = useMutation({
    mutationFn: async (status: "in_progress" | "cancelled") => {
      const { error } = await api.POST(
        "/api/engagements/{engagement_id}/status",
        {
          params: { path: { engagement_id: engagement.id } },
          body: { status } as never,
        },
      );
      if (error) {
        const msg = (error as { detail?: string }).detail ?? "Status update failed.";
        throw new Error(msg);
      }
    },
    onSuccess: (_d, status) => {
      qc.invalidateQueries({ queryKey: ["engagements", engagement.id] });
      qc.invalidateQueries({ queryKey: ["families", engagement.family.id] });
      snackbar.show(status === "cancelled" ? "Engagement cancelled" : "Engagement reopened");
    },
    onError: (e: Error) => snackbar.show(e.message, "error"),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await api.DELETE(
        "/api/engagements/{engagement_id}",
        { params: { path: { engagement_id: engagement.id } } },
      );
      if (error) {
        const msg = (error as { detail?: string }).detail ?? "Delete failed.";
        throw new Error(msg);
      }
    },
    onSuccess: () => {
      // Drop the now-gone engagement from every list that references
      // it. The intake list also re-derives its "Converted" badge from
      // converted_at, which the backend cleared if this was the
      // intake's last engagement — so it needs to refetch too.
      qc.removeQueries({ queryKey: ["engagements", engagement.id] });
      qc.invalidateQueries({ queryKey: ["engagements"] });
      qc.invalidateQueries({ queryKey: ["families"] });
      qc.invalidateQueries({ queryKey: ["intakes"] });
      snackbar.show("Engagement deleted");
      navigate("/engagements");
    },
    onError: (e: Error) => snackbar.show(e.message, "error"),
  });

  const isCancelled = engagement.status === "cancelled";
  return (
    <>
      <Tooltip title="Engagement actions">
        <IconButton
          onClick={(e) => setAnchor(e.currentTarget)}
          aria-label="Engagement actions"
          size="medium"
        >
          <MoreVertIcon />
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={anchor}
        open={!!anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
      >
        {isCancelled ? (
          <MenuItem
            onClick={() => {
              setAnchor(null);
              setStatus.mutate("in_progress");
            }}
            disabled={setStatus.isPending}
          >
            <ListItemIcon>
              <ReplayIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Reopen engagement</ListItemText>
          </MenuItem>
        ) : (
          <MenuItem
            onClick={() => {
              setAnchor(null);
              setStatus.mutate("cancelled");
            }}
            disabled={setStatus.isPending}
            sx={{ color: "warning.main" }}
          >
            <ListItemIcon>
              <PauseCircleOutlineIcon fontSize="small" sx={{ color: "warning.main" }} />
            </ListItemIcon>
            <ListItemText>Cancel engagement</ListItemText>
          </MenuItem>
        )}
        <MenuItem
          onClick={() => {
            setAnchor(null);
            setConfirmingDelete(true);
          }}
          sx={{ color: "error.main" }}
        >
          <ListItemIcon>
            <DeleteOutlineIcon fontSize="small" sx={{ color: "error.main" }} />
          </ListItemIcon>
          <ListItemText>Delete engagement</ListItemText>
        </MenuItem>
      </Menu>
      <Dialog
        open={confirmingDelete}
        onClose={() => {
          if (!remove.isPending) setConfirmingDelete(false);
        }}
        maxWidth="xs"
      >
        <DialogTitle>Delete engagement?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            Soft-deletes this engagement. It disappears from lists but the
            underlying records (notes, time, invoices) stay intact, and the
            originating intake re-opens if this was its last engagement.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmingDelete(false)} disabled={remove.isPending}>
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => remove.mutate()}
            disabled={remove.isPending}
          >
            {remove.isPending ? "Deleting…" : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

function HeaderStrip({ engagement }: { engagement: EngagementDetail }) {
  return (
    <Paper variant="outlined" sx={{ p: 2.5 }}>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "auto 1fr auto 1fr",
          columnGap: 2,
          rowGap: 1,
        }}
      >
        <Label>Student</Label>
        <Value>
          {engagement.student ? (
            <MuiLink
              component={RouterLink}
              to={`/students/${engagement.student.id}`}
              underline="hover"
            >
              {engagement.student.name}
            </MuiLink>
          ) : (
            <Box component="span" sx={{ color: "text.disabled" }}>—</Box>
          )}
          {engagement.student?.current_grade && (
            <Box component="span" sx={{ color: "text.secondary", ml: 1, fontSize: 13 }}>
              · Grade {engagement.student.current_grade}
            </Box>
          )}
        </Value>
        <Label>Lead</Label>
        <Value>{engagement.lead_consultant?.name ?? "—"}</Value>
        <Label>Started</Label>
        <Value>
          {engagement.start_date ? dayjs(engagement.start_date).format("MMM D, YYYY") : "—"}
        </Value>
        <Label>Target end</Label>
        <Value>
          {engagement.target_end_date
            ? dayjs(engagement.target_end_date).format("MMM D, YYYY")
            : "—"}
        </Value>
        <Label>Rate</Label>
        <Value>
          <RateEditor engagement={engagement} />
        </Value>
        <Label>Tasks</Label>
        <Value>
          {engagement.counts.tasks_completed} / {engagement.counts.tasks_total} complete
          {engagement.counts.tasks_na > 0 ? ` · ${engagement.counts.tasks_na} N/A` : ""}
        </Value>
      </Box>
      {engagement.notes && (
        <Box sx={{ mt: 2, pt: 2, borderTop: 1, borderColor: "divider" }}>
          <Typography variant="caption" color="text.secondary">
            Notes
          </Typography>
          <Typography variant="body2" sx={{ whiteSpace: "pre-line", mt: 0.5 }}>
            {engagement.notes}
          </Typography>
        </Box>
      )}
    </Paper>
  );
}


function RateEditor({ engagement }: { engagement: EngagementDetail }) {
  const qc = useQueryClient();
  const snackbar = useSnackbar();
  const initial = engagement.default_hourly_rate ?? "";
  const [draft, setDraft] = useState<string>(initial);
  useEffect(() => {
    setDraft(initial);
  }, [initial]);

  const patch = useMutation({
    mutationFn: async (value: string | null) => {
      const { error } = await api.PATCH(
        "/api/engagements/{engagement_id}",
        {
          params: { path: { engagement_id: engagement.id } },
          body: { default_hourly_rate: value } as never,
        },
      );
      if (error) {
        const msg = (error as { detail?: string }).detail ?? "Rate update failed.";
        throw new Error(msg);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["engagements", engagement.id] });
    },
    onError: (e: Error) => snackbar.show(e.message, "error"),
  });

  return (
    <TextField
      variant="standard"
      size="small"
      placeholder="—"
      type="number"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const next = draft.trim() === "" ? null : draft.trim();
        const original = initial === "" ? null : String(initial);
        if (next !== original) patch.mutate(next);
      }}
      inputProps={{ step: "0.01", min: 0, "aria-label": "Hourly rate" }}
      InputProps={{
        disableUnderline: !patch.isPending && draft === initial,
        startAdornment: (
          <InputAdornment position="start" sx={{ mr: 0.25 }}>
            $
          </InputAdornment>
        ),
        endAdornment: (
          <InputAdornment position="end" sx={{ ml: 0.25, color: "text.secondary" }}>
            /hr
          </InputAdornment>
        ),
      }}
      sx={{
        width: 140,
        "& .MuiInput-input": { textAlign: "left" },
      }}
    />
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <Typography
      variant="caption"
      color="text.secondary"
      sx={{ textTransform: "uppercase", letterSpacing: 0.5, alignSelf: "center" }}
    >
      {children}
    </Typography>
  );
}

function Value({ children }: { children: React.ReactNode }) {
  return <Typography variant="body2">{children}</Typography>;
}
