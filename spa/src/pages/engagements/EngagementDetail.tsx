import { useMemo, useState } from "react";
import {
  Alert,
  Box,
  Breadcrumbs,
  Button,
  CircularProgress,
  Divider,
  Link as MuiLink,
  Menu,
  MenuItem,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import CircleOutlinedIcon from "@mui/icons-material/CircleOutlined";
import PauseCircleOutlineIcon from "@mui/icons-material/PauseCircleOutline";
import PlayCircleOutlineIcon from "@mui/icons-material/PlayCircleOutline";
import RemoveCircleOutlineIcon from "@mui/icons-material/RemoveCircleOutline";
import dayjs from "dayjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link as RouterLink, useNavigate, useParams } from "react-router-dom";

import { api } from "../../api/client";
import { useSnackbar } from "../../components/Snackbar";
import { StatusChip } from "../../components/StatusChip";

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

interface EngagementTask {
  id: string;
  engagement_id: string;
  service_item_id: string | null;
  phase_id: string | null;
  title: string;
  description: string | null;
  status: "not_started" | "in_progress" | "completed" | "blocked" | "not_applicable";
  est_hours: string | null;
  actual_hours: string | null;
  billable: boolean;
  deliverable: string | null;
  sort_order: number;
}

interface CatalogPhase {
  id: string;
  scope: string;
  sort_order: number;
  title: string;
  description: string | null;
  est_hours: string | null;
}

interface CatalogResponse {
  phases: CatalogPhase[];
  service_items: Array<{
    id: string;
    phase_id: string;
    title: string;
    sort_order: number;
  }>;
}

const STATUS_TONES: Record<EngagementTask["status"], "neutral" | "info" | "success" | "warning" | "danger"> = {
  not_started: "neutral",
  in_progress: "info",
  completed: "success",
  blocked: "warning",
  not_applicable: "neutral",
};
const STATUS_LABELS: Record<EngagementTask["status"], string> = {
  not_started: "Not started",
  in_progress: "In progress",
  completed: "Completed",
  blocked: "Blocked",
  not_applicable: "N/A",
};
const STATUS_ICONS: Record<EngagementTask["status"], React.ReactNode> = {
  not_started: <CircleOutlinedIcon fontSize="small" />,
  in_progress: <PlayCircleOutlineIcon fontSize="small" />,
  completed: <CheckCircleOutlineIcon fontSize="small" />,
  blocked: <PauseCircleOutlineIcon fontSize="small" />,
  not_applicable: <RemoveCircleOutlineIcon fontSize="small" />,
};

export function EngagementDetail() {
  const { id } = useParams<{ id: string }>();

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

  const tasks = useQuery<EngagementTask[], Error>({
    queryKey: ["engagements", id, "tasks"],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await api.GET(
        "/api/engagements/{engagement_id}/tasks",
        { params: { path: { engagement_id: id! } } },
      );
      if (error || !data) throw new Error("Failed to load tasks.");
      return data as unknown as EngagementTask[];
    },
  });

  const catalog = useQuery<CatalogResponse, Error>({
    queryKey: ["engagements", id, "catalog"],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await api.GET(
        "/api/engagements/{engagement_id}/catalog",
        { params: { path: { engagement_id: id! } } },
      );
      if (error || !data) throw new Error("Failed to load catalog.");
      return data as unknown as CatalogResponse;
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

      <PhaseChecklist
        engagementId={id!}
        engagementType={engagement.data.engagement_type}
        tasks={tasks.data ?? []}
        catalogPhases={catalog.data?.phases ?? []}
        loading={tasks.isPending || catalog.isPending}
      />
    </Stack>
  );
}

function HeaderStrip({ engagement }: { engagement: EngagementDetail }) {
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

function PhaseChecklist({
  engagementId,
  engagementType,
  tasks,
  catalogPhases,
  loading,
}: {
  engagementId: string;
  engagementType: string;
  tasks: EngagementTask[];
  catalogPhases: CatalogPhase[];
  loading: boolean;
}) {
  const qc = useQueryClient();
  const snackbar = useSnackbar();

  // Group tasks by phase_id. Tasks without a phase land in an "Other"
  // bucket so the operator can still see them.
  const byPhase = useMemo(() => {
    const groups = new Map<string | null, EngagementTask[]>();
    for (const t of tasks) {
      const key = t.phase_id ?? null;
      const arr = groups.get(key) ?? [];
      arr.push(t);
      groups.set(key, arr);
    }
    for (const arr of groups.values()) {
      arr.sort((a, b) => a.sort_order - b.sort_order);
    }
    return groups;
  }, [tasks]);

  const setStatus = useMutation({
    mutationFn: async (args: { id: string; status: EngagementTask["status"] }) => {
      const { error } = await api.POST("/api/tasks/{task_id}/status", {
        params: { path: { task_id: args.id } },
        body: { status: args.status },
      });
      if (error) {
        const msg = (error as { detail?: string }).detail ?? "Status update failed.";
        throw new Error(msg);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["engagements", engagementId] });
      qc.invalidateQueries({ queryKey: ["engagements", engagementId, "tasks"] });
    },
    onError: (e: Error) => snackbar.show(e.message, "error"),
  });

  if (loading) {
    return (
      <Paper variant="outlined" sx={{ p: 4, display: "flex", justifyContent: "center" }}>
        <CircularProgress size={24} />
      </Paper>
    );
  }

  if (tasks.length === 0) {
    return (
      <Paper variant="outlined" sx={{ p: 3 }}>
        <Typography variant="overline" color="text.secondary" sx={{ display: "block", mb: 1 }}>
          Phases &amp; tasks
        </Typography>
        <Divider sx={{ mb: 2 }} />
        <NoTasksState engagementId={engagementId} engagementType={engagementType} />
      </Paper>
    );
  }

  // Sort phases by their catalog sort_order, then put orphan tasks
  // (phase_id null) at the end under "Other".
  const phaseOrder = new Map(catalogPhases.map((p, i) => [p.id, i]));
  const orderedPhaseIds = Array.from(byPhase.keys()).sort((a, b) => {
    if (a === null) return 1;
    if (b === null) return -1;
    return (phaseOrder.get(a) ?? 999) - (phaseOrder.get(b) ?? 999);
  });

  return (
    <Paper variant="outlined" sx={{ p: 3 }}>
      <Typography variant="overline" color="text.secondary" sx={{ display: "block", mb: 1 }}>
        Phases &amp; tasks
      </Typography>
      <Divider sx={{ mb: 2 }} />
      <Stack spacing={3}>
        {orderedPhaseIds.map((phaseId) => {
          const phase = phaseId
            ? catalogPhases.find((p) => p.id === phaseId)
            : null;
          const phaseTasks = byPhase.get(phaseId) ?? [];
          const total = phaseTasks.length;
          const done = phaseTasks.filter((t) => t.status === "completed").length;
          const na = phaseTasks.filter((t) => t.status === "not_applicable").length;
          return (
            <Box key={phaseId ?? "orphan"}>
              <Stack direction="row" alignItems="baseline" spacing={1} sx={{ mb: 1 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  {phase?.title ?? "Other tasks"}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {done} / {total} complete
                  {na > 0 ? ` · ${na} N/A` : ""}
                </Typography>
              </Stack>
              <Stack spacing={0.5}>
                {phaseTasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    onSetStatus={(status) =>
                      setStatus.mutate({ id: task.id, status })
                    }
                  />
                ))}
              </Stack>
            </Box>
          );
        })}
      </Stack>
    </Paper>
  );
}

function TaskRow({
  task,
  onSetStatus,
}: {
  task: EngagementTask;
  onSetStatus: (status: EngagementTask["status"]) => void;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const dimmed = task.status === "not_applicable";
  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={1}
      sx={{
        py: 0.75,
        px: 1,
        borderRadius: 1,
        opacity: dimmed ? 0.55 : 1,
        "&:hover": { bgcolor: "action.hover" },
      }}
    >
      <Box
        component="button"
        type="button"
        onClick={(e) => setAnchor(e.currentTarget)}
        sx={{
          all: "unset",
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          color:
            task.status === "completed"
              ? "success.main"
              : task.status === "in_progress"
              ? "primary.main"
              : task.status === "blocked"
              ? "warning.main"
              : "text.secondary",
        }}
      >
        {STATUS_ICONS[task.status]}
      </Box>
      <Typography
        variant="body2"
        sx={{
          flex: 1,
          textDecoration:
            task.status === "completed"
              ? "line-through"
              : task.status === "not_applicable"
              ? "line-through"
              : "none",
          textDecorationColor: "text.disabled",
        }}
      >
        {task.title}
      </Typography>
      {task.est_hours && (
        <Typography variant="caption" color="text.secondary">
          {task.est_hours}h est
        </Typography>
      )}
      <Box
        component="button"
        type="button"
        onClick={(e) => setAnchor(e.currentTarget)}
        sx={{
          all: "unset",
          cursor: "pointer",
          minWidth: 110,
          textAlign: "right",
        }}
      >
        <StatusChip
          size="small"
          label={STATUS_LABELS[task.status]}
          tone={STATUS_TONES[task.status]}
          variant="outlined"
          sx={{ cursor: "pointer" }}
        />
      </Box>
      <Menu
        anchorEl={anchor}
        open={!!anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
      >
        {(["not_started", "in_progress", "completed", "blocked", "not_applicable"] as const).map((s) => (
          <MenuItem
            key={s}
            selected={task.status === s}
            onClick={() => {
              onSetStatus(s);
              setAnchor(null);
            }}
          >
            <Stack direction="row" spacing={1} alignItems="center">
              {STATUS_ICONS[s]}
              <Box component="span">{STATUS_LABELS[s]}</Box>
            </Stack>
          </MenuItem>
        ))}
      </Menu>
    </Stack>
  );
}

function NoTasksState({
  engagementId,
  engagementType,
}: {
  engagementId: string;
  engagementType: string;
}) {
  const qc = useQueryClient();
  const snackbar = useSnackbar();
  const navigate = useNavigate();
  void navigate;

  const seed = useMutation({
    mutationFn: async () => {
      // Pull the catalog, then bulk-from-catalog with everything.
      const { data, error } = await api.GET(
        "/api/engagements/{engagement_id}/catalog",
        { params: { path: { engagement_id: engagementId } } },
      );
      if (error || !data) throw new Error("Failed to load catalog.");
      const itemIds = (data as unknown as CatalogResponse).service_items.map(
        (s) => s.id,
      );
      if (itemIds.length === 0) return { created: 0 };
      const post = await api.POST(
        "/api/engagements/{engagement_id}/tasks/bulk-from-catalog",
        {
          params: { path: { engagement_id: engagementId } },
          body: { service_item_ids: itemIds } as never,
        },
      );
      if (post.error) {
        const msg = (post.error as { detail?: string }).detail ?? "Seed failed.";
        throw new Error(msg);
      }
      return post.data as { created: number };
    },
    onSuccess: (out) => {
      snackbar.show(`Seeded ${out.created} task${out.created === 1 ? "" : "s"} from catalog`);
      qc.invalidateQueries({ queryKey: ["engagements", engagementId, "tasks"] });
      qc.invalidateQueries({ queryKey: ["engagements", engagementId] });
    },
    onError: (e: Error) => snackbar.show(e.message, "error"),
  });

  return (
    <Stack spacing={2} alignItems="flex-start">
      <Typography variant="body2" color="text.secondary">
        No tasks yet on this engagement. Seed it from the catalog to get the
        standard phase checklist for a{" "}
        <Box component="span" sx={{ fontWeight: 500 }}>
          {labelForType(engagementType)}
        </Box>{" "}
        engagement.
      </Typography>
      <Button
        variant="contained"
        onClick={() => seed.mutate()}
        disabled={seed.isPending}
      >
        {seed.isPending ? "Seeding…" : "Seed from catalog"}
      </Button>
    </Stack>
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

function labelForType(t: string): string {
  switch (t) {
    case "assessment":
      return "Assessment";
    case "full_placement":
      return "Full placement";
    default:
      return t.replace(/_/g, " ");
  }
}
