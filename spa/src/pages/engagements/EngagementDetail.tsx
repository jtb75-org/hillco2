import { useState } from "react";
import {
  Alert,
  Box,
  Breadcrumbs,
  Button,
  CircularProgress,
  Divider,
  Link as MuiLink,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import PauseCircleOutlineIcon from "@mui/icons-material/PauseCircleOutline";
import ReplayIcon from "@mui/icons-material/Replay";
import dayjs from "dayjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link as RouterLink, useNavigate, useParams } from "react-router-dom";

import { api } from "../../api/client";
import { useSnackbar } from "../../components/Snackbar";
import { StatusChip } from "../../components/StatusChip";
import { useEngagementTypes } from "../../hooks/useEngagementTypes";
import { ActivitiesCard } from "./ActivitiesCard";
import { ContractCard } from "./ContractCard";
import { ExpensesCard } from "./ExpensesCard";
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
      <Breadcrumbs>
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
      </Breadcrumbs>

      <HeaderStrip engagement={engagement.data} />

      <IntakeContextCard snapshot={engagement.data.intake_snapshot} />

      <ContractCard engagementId={id!} />

      <RequirementsCard engagementId={id!} />

      <ActivitiesCard engagementId={id!} />

      <TimeEntriesCard engagementId={id!} />

      <ExpensesCard engagementId={id!} />

      <NotesCard engagementId={id!} />

      <DangerZoneCard engagement={engagement.data} />
    </Stack>
  );
}

function DangerZoneCard({ engagement }: { engagement: EngagementDetail }) {
  const qc = useQueryClient();
  const snackbar = useSnackbar();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);

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
      qc.invalidateQueries({ queryKey: ["families", engagement.family.id] });
      snackbar.show("Engagement deleted");
      navigate(`/families/${engagement.family.id}`);
    },
    onError: (e: Error) => snackbar.show(e.message, "error"),
  });

  const isCancelled = engagement.status === "cancelled";
  return (
    <Paper variant="outlined" sx={{ p: 2.5 }}>
      <Typography variant="overline" color="error.main" sx={{ display: "block", mb: 1 }}>
        Danger zone
      </Typography>
      <Divider sx={{ mb: 1.5 }} />
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems="flex-start">
        {isCancelled ? (
          <Button
            variant="outlined"
            startIcon={<ReplayIcon />}
            onClick={() => setStatus.mutate("in_progress")}
            disabled={setStatus.isPending}
          >
            Reopen engagement
          </Button>
        ) : (
          <Button
            color="warning"
            variant="outlined"
            startIcon={<PauseCircleOutlineIcon />}
            onClick={() => setStatus.mutate("cancelled")}
            disabled={setStatus.isPending}
          >
            Cancel engagement
          </Button>
        )}
        {!confirming ? (
          <Button
            color="error"
            variant="outlined"
            startIcon={<DeleteOutlineIcon />}
            onClick={() => setConfirming(true)}
          >
            Delete engagement
          </Button>
        ) : (
          <Stack spacing={1}>
            <Typography variant="body2" color="text.secondary">
              Soft-delete this engagement? It disappears from lists but the
              underlying records (notes, time, invoices) stay intact.
            </Typography>
            <Stack direction="row" spacing={1}>
              <Button
                color="error"
                variant="contained"
                onClick={() => remove.mutate()}
                disabled={remove.isPending}
              >
                Confirm delete
              </Button>
              <Button onClick={() => setConfirming(false)}>Cancel</Button>
            </Stack>
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}

function HeaderStrip({ engagement }: { engagement: EngagementDetail }) {
  const { labelFor: labelForType } = useEngagementTypes();
  return (
    <Paper variant="outlined" sx={{ p: 2.5 }}>
      <Stack direction="row" alignItems="baseline" spacing={2} sx={{ mb: 1, flexWrap: "wrap" }}>
        <Typography variant="h4" sx={{ fontWeight: 600 }}>
          {labelForType(engagement.engagement_type)}
        </Typography>
        <StatusChip
          size="small"
          label={engagement.status.replace(/_/g, " ")}
          tone={engagement.status === "in_progress" ? "info" : engagement.status === "completed" ? "success" : "neutral"}
          variant="outlined"
        />
      </Stack>
      <Box
        sx={{
          mt: 2,
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
          {engagement.default_hourly_rate ? `$${engagement.default_hourly_rate}/hr` : "—"}
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

