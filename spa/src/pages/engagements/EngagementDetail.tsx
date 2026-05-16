import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Breadcrumbs,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Link as MuiLink,
  Menu,
  MenuItem,
  Paper,
  Stack,
  Step,
  StepButton,
  Stepper,
  TextField,
  Typography,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import CircleOutlinedIcon from "@mui/icons-material/CircleOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import PauseCircleOutlineIcon from "@mui/icons-material/PauseCircleOutline";
import PlayCircleOutlineIcon from "@mui/icons-material/PlayCircleOutline";
import RemoveCircleOutlineIcon from "@mui/icons-material/RemoveCircleOutline";
import ReplayIcon from "@mui/icons-material/Replay";
import dayjs from "dayjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link as RouterLink, useNavigate, useParams } from "react-router-dom";

import { api } from "../../api/client";
import { useSnackbar } from "../../components/Snackbar";
import { StatusChip } from "../../components/StatusChip";
import { useEngagementTypes } from "../../hooks/useEngagementTypes";
import { ContractCard } from "./ContractCard";
import { IntakeContextCard, type IntakeSnapshot } from "./IntakeContextCard";
import { RequirementsCard } from "./RequirementsCard";

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

interface CatalogServiceItem {
  id: string;
  phase_id: string;
  title: string;
  sort_order: number;
}

interface CatalogPhase {
  id: string;
  sort_order: number;
  title: string;
  description: string | null;
  est_hours: string | null;
  items: CatalogServiceItem[];
}

// /api/engagements/{id}/catalog returns a flat list of phases each
// with embedded service items, not a wrapper object.
type CatalogResponse = CatalogPhase[];

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

// Stepper selection: "all" shows every phase; a phase UUID or null
// (the orphan / "Other tasks" bucket) filters the checklist down.
type PhaseSelection = string | null | "all";

export function EngagementDetail() {
  const { id } = useParams<{ id: string }>();
  const [selectedPhase, setSelectedPhase] = useState<PhaseSelection>("all");
  // Auto-jump to the first phase with incomplete work once tasks +
  // catalog have loaded. Guarded by a ref so a user who clicks "All
  // phases" doesn't immediately get re-routed back to the next phase.
  const autoSelectedRef = useRef(false);
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

  useEffect(() => {
    if (autoSelectedRef.current) return;
    const t = tasks.data;
    const c = catalog.data;
    if (!t || !c || t.length === 0 || c.length === 0) return;
    autoSelectedRef.current = true;
    const next = firstIncompletePhaseId(c, t);
    if (next) setSelectedPhase(next);
  }, [tasks.data, catalog.data]);

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

      <PhaseStepper
        catalogPhases={catalog.data ?? []}
        tasks={tasks.data ?? []}
        selected={selectedPhase}
        onSelect={setSelectedPhase}
      />

      <PhaseChecklist
        engagementId={id!}
        engagementType={engagement.data.engagement_type}
        studentId={engagement.data.student?.id ?? null}
        familyId={engagement.data.family.id}
        tasks={tasks.data ?? []}
        catalogPhases={catalog.data ?? []}
        loading={tasks.isPending || catalog.isPending}
        selectedPhase={selectedPhase}
        onClearFilter={() => setSelectedPhase("all")}
      />

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

function PhaseStepper({
  catalogPhases,
  tasks,
  selected,
  onSelect,
}: {
  catalogPhases: CatalogPhase[];
  tasks: EngagementTask[];
  selected: PhaseSelection;
  onSelect: (s: PhaseSelection) => void;
}) {
  const byPhase = useMemo(() => groupTasksByPhase(tasks), [tasks]);

  // One step per catalog phase, plus an "Other tasks" step iff there
  // are orphan (no phase_id) tasks. Stepper is intentionally hidden
  // until tasks have been seeded — there's nothing to summarize yet.
  const steps: Array<{ id: string | null; title: string }> = catalogPhases.map((p) => ({
    id: p.id,
    title: p.title,
  }));
  if ((byPhase.get(null)?.length ?? 0) > 0) {
    steps.push({ id: null, title: "Other tasks" });
  }
  if (steps.length === 0) return null;

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stepper nonLinear alternativeLabel sx={{ "& .MuiStepConnector-line": { mt: 1 } }}>
        {steps.map((s) => {
          const phaseTasks = byPhase.get(s.id) ?? [];
          const total = phaseTasks.length;
          const done = phaseTasks.filter((t) => t.status === "completed").length;
          const na = phaseTasks.filter((t) => t.status === "not_applicable").length;
          const isComplete = total > 0 && done + na === total;
          const isActive = selected === s.id;
          const eff = Math.max(total - na, 0);
          return (
            <Step key={s.id ?? "orphan"} completed={isComplete} active={isActive}>
              <StepButton
                onClick={() => onSelect(isActive ? "all" : s.id)}
                icon={
                  <PhaseStepIcon
                    done={done}
                    total={total}
                    na={na}
                    active={isActive}
                    completed={isComplete}
                  />
                }
              >
                <Stack alignItems="center" spacing={0.25}>
                  <Typography variant="body2" sx={{ fontWeight: isActive ? 600 : 500 }}>
                    {s.title}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {total === 0
                      ? "no tasks"
                      : `${done} / ${eff} complete${na > 0 ? ` · ${na} N/A` : ""}`}
                  </Typography>
                </Stack>
              </StepButton>
            </Step>
          );
        })}
      </Stepper>
    </Paper>
  );
}

function PhaseStepIcon({
  done,
  total,
  na,
  active,
  completed,
}: {
  done: number;
  total: number;
  na: number;
  active: boolean;
  completed: boolean;
}) {
  if (completed) {
    return (
      <CheckCircleIcon
        sx={{ fontSize: 32, color: active ? "primary.main" : "success.main" }}
      />
    );
  }
  if (total === 0) {
    return (
      <Box
        sx={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          border: 2,
          borderColor: active ? "primary.main" : "divider",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "text.disabled",
        }}
      >
        <Typography variant="caption" sx={{ fontSize: 11 }}>
          —
        </Typography>
      </Box>
    );
  }
  const eff = Math.max(total - na, 0);
  const pct = eff > 0 ? (done / eff) * 100 : 0;
  return (
    <Box sx={{ position: "relative", display: "inline-flex", width: 32, height: 32 }}>
      <CircularProgress
        variant="determinate"
        value={100}
        size={32}
        thickness={4}
        sx={{ color: "action.disabledBackground", position: "absolute" }}
      />
      <CircularProgress
        variant="determinate"
        value={pct}
        size={32}
        thickness={4}
        sx={{ color: active ? "primary.main" : "primary.light" }}
      />
      <Box
        sx={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Typography
          variant="caption"
          sx={{ fontSize: 11, fontWeight: 600, color: active ? "primary.main" : "text.primary" }}
        >
          {done}
        </Typography>
      </Box>
    </Box>
  );
}

/** First catalog phase (in catalog order) that still has open tasks.
 *  Phases with zero tasks or all tasks completed/N-A are skipped. */
function firstIncompletePhaseId(
  catalogPhases: CatalogPhase[],
  tasks: EngagementTask[],
): string | null {
  for (const phase of catalogPhases) {
    const phaseTasks = tasks.filter((t) => t.phase_id === phase.id);
    if (phaseTasks.length === 0) continue;
    const settled = phaseTasks.filter(
      (t) => t.status === "completed" || t.status === "not_applicable",
    ).length;
    if (settled < phaseTasks.length) return phase.id;
  }
  return null;
}

function groupTasksByPhase(tasks: EngagementTask[]): Map<string | null, EngagementTask[]> {
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
}

function PhaseChecklist({
  engagementId,
  engagementType,
  studentId,
  familyId,
  tasks,
  catalogPhases,
  loading,
  selectedPhase,
  onClearFilter,
}: {
  engagementId: string;
  engagementType: string;
  studentId: string | null;
  familyId: string;
  tasks: EngagementTask[];
  catalogPhases: CatalogPhase[];
  loading: boolean;
  selectedPhase: PhaseSelection;
  onClearFilter: () => void;
}) {
  const qc = useQueryClient();
  const snackbar = useSnackbar();

  // Group tasks by phase_id. Tasks without a phase land in an "Other"
  // bucket so the operator can still see them.
  const byPhase = useMemo(() => groupTasksByPhase(tasks), [tasks]);

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
  // Stable handler so ClientIntakePanel's auto-complete useEffect deps
  // don't churn every time setStatus.isPending toggles — without this,
  // each in-flight mutation re-renders us, mints a new onSetStatus,
  // and re-fires the effect before the tasks query has refetched.
  // That's React error #185 ("Maximum update depth exceeded").
  const handleSetStatus = useCallback(
    (taskId: string, status: EngagementTask["status"]) =>
      setStatus.mutate({ id: taskId, status }),
    [setStatus.mutate],
  );

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
  const visiblePhaseIds =
    selectedPhase === "all"
      ? orderedPhaseIds
      : orderedPhaseIds.filter((p) => p === selectedPhase);
  const filtered = selectedPhase !== "all";

  return (
    <Paper variant="outlined" sx={{ p: 3 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
        <Typography variant="overline" color="text.secondary">
          Phases &amp; tasks
        </Typography>
        {filtered && (
          <Button size="small" startIcon={<ArrowBackIcon />} onClick={onClearFilter}>
            All phases
          </Button>
        )}
      </Stack>
      <Divider sx={{ mb: 2 }} />
      <Stack spacing={3}>
        {visiblePhaseIds.length === 0 && (
          <Typography variant="body2" color="text.disabled">
            No tasks in this phase yet.
          </Typography>
        )}
        {visiblePhaseIds.map((phaseId) => {
          const phase = phaseId
            ? catalogPhases.find((p) => p.id === phaseId)
            : null;
          const phaseTasks = byPhase.get(phaseId) ?? [];
          const total = phaseTasks.length;
          const done = phaseTasks.filter((t) => t.status === "completed").length;
          const na = phaseTasks.filter((t) => t.status === "not_applicable").length;
          // The Client Intake phase gets a structured intake panel
          // (names/school/diagnoses/needs) instead of a plain task
          // list. Matched by title because scope is gone post-PR-C
          // and there's no stable "kind" field; the title is the only
          // anchor. Renaming the seed phase opts out of the panel.
          const isClientIntake = phase?.title === "Client Intake";
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
              {isClientIntake && studentId ? (
                <ClientIntakePanel
                  studentId={studentId}
                  familyId={familyId}
                  phaseTasks={phaseTasks}
                  onSetStatus={handleSetStatus}
                />
              ) : (
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
              )}
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
  const { labelFor: labelForType } = useEngagementTypes();
  void navigate;

  const seed = useMutation({
    mutationFn: async () => {
      // Pull the catalog, then bulk-from-catalog with everything.
      const { data, error } = await api.GET(
        "/api/engagements/{engagement_id}/catalog",
        { params: { path: { engagement_id: engagementId } } },
      );
      if (error || !data) throw new Error("Failed to load catalog.");
      const phases = data as unknown as CatalogResponse;
      const itemIds = phases.flatMap((p) => (p.items ?? []).map((i) => i.id));
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

// ---- Client Intake panel ------------------------------------------------

// Subset of /api/students/{id} we read for the intake review. Hand-typed
// because the endpoint returns a plain dict, no OpenAPI response model.
interface StudentIntake {
  id: string;
  name: string;
  current_school_id: string | null;
  current_grade: string | null;
  needs_goals: string | null;
  has_504: boolean;
  has_iep: boolean;
  has_learning_disability: boolean;
  has_adhd: boolean;
  has_intellectual_disability: boolean;
  has_health_impairment: boolean;
  has_emotional_disturbance: boolean;
  autism_level: 1 | 2 | 3 | null;
  diagnosis_other: string | null;
  school: { id: string; name: string } | null;
  primary_parent: { name: string; email: string | null; phone: string | null } | null;
}

interface SchoolOption {
  id: string;
  name: string;
  location: string | null;
}

/** Render the four Client Intake tasks as inline data blocks. Each block
 *  pulls from the student record, lets the user fill the gap, and ticks
 *  its matching engagement_task green when the data is present. Auto-
 *  completion only fires when the task is still `not_started` so the
 *  user can park anything in blocked / N-A and we won't fight them. */
function ClientIntakePanel({
  studentId,
  familyId,
  phaseTasks,
  onSetStatus,
}: {
  studentId: string;
  familyId: string;
  phaseTasks: EngagementTask[];
  onSetStatus: (taskId: string, status: EngagementTask["status"]) => void;
}) {
  const qc = useQueryClient();
  const snackbar = useSnackbar();

  const student = useQuery<StudentIntake, Error>({
    queryKey: ["students", studentId],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/students/{student_id}", {
        params: { path: { student_id: studentId } },
      });
      if (error || !data) throw new Error("Failed to load student.");
      return data as unknown as StudentIntake;
    },
  });

  const schools = useQuery<SchoolOption[], Error>({
    queryKey: ["schools"],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/schools", {});
      if (error || !data) throw new Error("Failed to load schools.");
      return data as unknown as SchoolOption[];
    },
  });

  const patchStudent = useMutation({
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ["students", studentId] }),
    onError: (e: Error) => snackbar.show(e.message, "error"),
  });

  const tasks = useMemo(() => {
    const byTitle: Record<string, EngagementTask | undefined> = {};
    for (const t of phaseTasks) byTitle[t.title] = t;
    return {
      names: byTitle["Names and contact"],
      school: byTitle["Current school"],
      diagnoses: byTitle["Background diagnoses"],
      needs: byTitle["Needs and goals"],
    };
  }, [phaseTasks]);

  // Auto-complete tasks whose data is unambiguously present. Each guard
  // checks `not_started` so blocked / N-A overrides aren't trampled.
  // Background diagnoses is special: chips set => data present, ticks
  // green; no chips set is ambiguous (not reviewed vs. nothing applies)
  // so the task stays manual in that case.
  //
  // A per-mount ref-set tracks which task IDs we've already auto-fired
  // so that even if the effect re-runs (e.g., due to a stale tasks
  // snapshot in flight) we never PATCH the same task twice. That's
  // belt-and-suspenders next to handleSetStatus being stabilized by
  // useCallback upstream — without it, the in-flight mutation can
  // briefly leave the task as not_started across renders and cause
  // React error #185 ("Maximum update depth exceeded").
  const autoFiredRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const s = student.data;
    if (!s) return;
    const fire = (task: EngagementTask | undefined, when: boolean) => {
      if (!task || task.status !== "not_started" || !when) return;
      if (autoFiredRef.current.has(task.id)) return;
      autoFiredRef.current.add(task.id);
      onSetStatus(task.id, "completed");
    };
    fire(tasks.names, true);
    fire(tasks.school, !!s.current_school_id);
    fire(tasks.needs, !!(s.needs_goals ?? "").trim());
    fire(tasks.diagnoses, hasAnyDiagnosis(s));
  }, [student.data, tasks, onSetStatus]);

  if (student.isPending) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
        <CircularProgress size={20} />
      </Box>
    );
  }
  if (student.error || !student.data) {
    return <Alert severity="error">{student.error?.message ?? "Student not found."}</Alert>;
  }
  const s = student.data;

  return (
    <Stack spacing={1.5}>
      <IntakeBlock title="Names & contact" task={tasks.names} onSetStatus={onSetStatus}>
        <Stack spacing={0.5}>
          <Typography variant="body2">
            <Box component="span" sx={{ color: "text.secondary", mr: 1 }}>Student:</Box>
            <MuiLink component={RouterLink} to={`/students/${s.id}`} underline="hover">
              {s.name}
            </MuiLink>
            {s.current_grade && (
              <Box component="span" sx={{ color: "text.secondary", ml: 1, fontSize: 13 }}>
                · Grade {s.current_grade}
              </Box>
            )}
          </Typography>
          {s.primary_parent ? (
            <Typography variant="body2">
              <Box component="span" sx={{ color: "text.secondary", mr: 1 }}>Primary parent:</Box>
              {s.primary_parent.name}
              {s.primary_parent.email && (
                <Box component="span" sx={{ color: "text.secondary", ml: 1 }}>
                  · {s.primary_parent.email}
                </Box>
              )}
              {s.primary_parent.phone && (
                <Box component="span" sx={{ color: "text.secondary", ml: 1 }}>
                  · {s.primary_parent.phone}
                </Box>
              )}
            </Typography>
          ) : (
            <Typography variant="body2" color="warning.main">
              No primary parent on the family.{" "}
              <MuiLink component={RouterLink} to={`/families/${familyId}`} underline="hover">
                Add one
              </MuiLink>
              .
            </Typography>
          )}
        </Stack>
      </IntakeBlock>

      <IntakeBlock title="Current school" task={tasks.school} onSetStatus={onSetStatus}>
        <Autocomplete
          size="small"
          options={schools.data ?? []}
          loading={schools.isPending}
          getOptionLabel={(o) => o.name}
          isOptionEqualToValue={(a, b) => a.id === b.id}
          value={
            s.current_school_id
              ? (schools.data ?? []).find((o) => o.id === s.current_school_id) ?? null
              : null
          }
          onChange={(_e, option) =>
            patchStudent.mutate({ current_school_id: option?.id ?? null })
          }
          renderOption={(props, o) => (
            <li {...props} key={o.id}>
              <Stack>
                <Box component="span">{o.name}</Box>
                {o.location && (
                  <Box component="span" sx={{ color: "text.secondary", fontSize: 12 }}>
                    {o.location}
                  </Box>
                )}
              </Stack>
            </li>
          )}
          renderInput={(params) => (
            <TextField {...params} placeholder="Select the student's current school" />
          )}
        />
      </IntakeBlock>

      <IntakeBlock title="Background diagnoses" task={tasks.diagnoses} onSetStatus={onSetStatus}>
        <DiagnosisSummary student={s} />
      </IntakeBlock>

      <IntakeBlock title="Needs & goals" task={tasks.needs} onSetStatus={onSetStatus}>
        <NeedsGoalsField
          initial={s.needs_goals ?? ""}
          onCommit={(v) => patchStudent.mutate({ needs_goals: v || null })}
        />
      </IntakeBlock>
    </Stack>
  );
}

/** Card-shaped wrapper for a single intake block: title on the left,
 *  task status chip on the right (clickable to open the standard status
 *  menu), free-form body content below. */
function IntakeBlock({
  title,
  task,
  onSetStatus,
  children,
}: {
  title: string;
  task: EngagementTask | undefined;
  onSetStatus: (taskId: string, status: EngagementTask["status"]) => void;
  children: React.ReactNode;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 1 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          {title}
        </Typography>
        {task && (
          <Box
            component="button"
            type="button"
            onClick={(e) => setAnchor(e.currentTarget)}
            sx={{ all: "unset", cursor: "pointer" }}
          >
            <StatusChip
              size="small"
              label={STATUS_LABELS[task.status]}
              tone={STATUS_TONES[task.status]}
              variant="outlined"
              sx={{ cursor: "pointer" }}
            />
          </Box>
        )}
        {task && (
          <Menu
            anchorEl={anchor}
            open={!!anchor}
            onClose={() => setAnchor(null)}
            anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
            transformOrigin={{ vertical: "top", horizontal: "right" }}
          >
            {(["not_started", "in_progress", "completed", "blocked", "not_applicable"] as const).map((st) => (
              <MenuItem
                key={st}
                selected={task.status === st}
                onClick={() => {
                  onSetStatus(task.id, st);
                  setAnchor(null);
                }}
              >
                <Stack direction="row" spacing={1} alignItems="center">
                  {STATUS_ICONS[st]}
                  <Box component="span">{STATUS_LABELS[st]}</Box>
                </Stack>
              </MenuItem>
            ))}
          </Menu>
        )}
      </Stack>
      {children}
    </Paper>
  );
}

function hasAnyDiagnosis(s: StudentIntake): boolean {
  return (
    s.has_504 ||
    s.has_iep ||
    s.has_learning_disability ||
    s.has_adhd ||
    s.has_intellectual_disability ||
    s.has_health_impairment ||
    s.has_emotional_disturbance ||
    s.autism_level != null ||
    !!(s.diagnosis_other ?? "").trim()
  );
}

function DiagnosisSummary({ student }: { student: StudentIntake }) {
  const chips: string[] = [];
  if (student.has_504) chips.push("504");
  if (student.has_iep) chips.push("IEP");
  if (student.has_learning_disability) chips.push("Learning disability");
  if (student.autism_level != null) chips.push(`Autism Level ${student.autism_level}`);
  if (student.has_adhd) chips.push("ADHD / ADD");
  if (student.has_intellectual_disability) chips.push("Intellectual disability");
  if (student.has_health_impairment) chips.push("Health impairment");
  if (student.has_emotional_disturbance) chips.push("Emotional disturbance");
  if (student.diagnosis_other) chips.push(`Other: ${student.diagnosis_other}`);
  return (
    <Stack spacing={1}>
      {chips.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          None recorded yet.
        </Typography>
      ) : (
        <Stack direction="row" spacing={0.5} flexWrap="wrap" sx={{ gap: 0.5 }}>
          {chips.map((c) => (
            <Chip key={c} size="small" label={c} variant="outlined" />
          ))}
        </Stack>
      )}
      <Typography variant="caption">
        <MuiLink component={RouterLink} to={`/students/${student.id}`} underline="hover">
          Edit on student page
        </MuiLink>
      </Typography>
    </Stack>
  );
}

function NeedsGoalsField({
  initial,
  onCommit,
}: {
  initial: string;
  onCommit: (v: string) => void;
}) {
  const [value, setValue] = useState(initial);
  useEffect(() => {
    setValue(initial);
  }, [initial]);
  return (
    <TextField
      fullWidth
      size="small"
      multiline
      minRows={3}
      placeholder="What is this student working toward? Skills, accommodations, supports, fit factors."
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        if (value !== initial) onCommit(value);
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

