import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Paper,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import ArchiveOutlinedIcon from "@mui/icons-material/ArchiveOutlined";
import HourglassEmptyOutlinedIcon from "@mui/icons-material/HourglassEmptyOutlined";
import SpaOutlinedIcon from "@mui/icons-material/SpaOutlined";
import TaskAltOutlinedIcon from "@mui/icons-material/TaskAltOutlined";
import ViewKanbanIcon from "@mui/icons-material/ViewKanban";
import ViewListIcon from "@mui/icons-material/ViewList";
import dayjs from "dayjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { api } from "../../api/client";
import { DataTableContainer } from "../../components/DataTableContainer";
import { PageHeader } from "../../components/PageHeader";
import { SectionPanel } from "../../components/SectionPanel";
import { useSnackbar } from "../../components/Snackbar";
import { StatCard } from "../../components/StatCard";
import { StatusChip } from "../../components/StatusChip";

import { PickOrCreateFamilyDialog } from "./PickOrCreateFamilyDialog";
import { OUTCOME_STATUS_DISPLAY, type Outcome } from "./intakeTypes";

interface IntakeRow {
  id: string;
  family_id: string;
  household_name: string;
  intake_date: string;
  consultant_id: string | null;
  consultant_name: string | null;
  notes: string | null;
  completed_at: string | null;
  outcome: Outcome | null;
  outcome_at: string | null;
  converted_at: string | null;
  created_at: string;
}

type ViewMode = "list" | "kanban";
const VIEW_STORAGE_KEY = "intakesView";

type Bucket = "in_progress" | "nurturing" | "converted" | "closed" | "all";

// Matches the kanban column groupings so the stat-strip counts and
// the kanban columns stay in lockstep. Lifted out of KANBAN_COLUMNS
// so the list view can filter by the same logic.
const BUCKET_MATCH: Record<Exclude<Bucket, "all">, (r: IntakeRow) => boolean> = {
  in_progress: (r) =>
    r.outcome == null || (r.outcome === "converting" && r.converted_at == null),
  nurturing: (r) => r.outcome === "nurture",
  converted: (r) => r.outcome === "converting" && r.converted_at != null,
  closed: (r) =>
    r.outcome != null && r.outcome !== "converting" && r.outcome !== "nurture",
};

// Display label + hover description for each phase. Single source of
// truth so the stat strip and the kanban columns always agree.
const PHASE_META: Record<
  Exclude<Bucket, "all">,
  { label: string; description: string }
> = {
  in_progress: {
    label: "New",
    description:
      "Intake underway — no outcome recorded yet, or marked to convert but not yet converted.",
  },
  nurturing: {
    label: "Deferred",
    description:
      "Not moving forward right now — set aside to follow up with later.",
  },
  converted: {
    label: "Converted",
    description:
      "Converted to a client — one or more engagements have been created.",
  },
  closed: {
    label: "Closed",
    description:
      "Closed out — the family declined, didn't respond, or was a duplicate.",
  },
};

const STAT_CARDS: Array<{
  key: Exclude<Bucket, "all">;
  subtitle: string;
  icon: JSX.Element;
}> = [
  {
    key: "in_progress",
    subtitle: "Awaiting next step",
    icon: <HourglassEmptyOutlinedIcon />,
  },
  {
    key: "nurturing",
    subtitle: "Follow up later",
    icon: <SpaOutlinedIcon />,
  },
  {
    key: "converted",
    subtitle: "Engagement spawned",
    icon: <TaskAltOutlinedIcon />,
  },
  {
    key: "closed",
    subtitle: "Declined / no response",
    icon: <ArchiveOutlinedIcon />,
  },
];

function loadInitialView(): ViewMode {
  // Kanban (column) is the default; only an explicit stored "list" opts out.
  if (typeof window === "undefined") return "kanban";
  const v = window.localStorage.getItem(VIEW_STORAGE_KEY);
  return v === "list" ? "list" : "kanban";
}

export function IntakesList() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const snackbar = useSnackbar();
  const [pickOpen, setPickOpen] = useState(false);
  const [view, setView] = useState<ViewMode>(() => loadInitialView());
  const [bucket, setBucket] = useState<Bucket>("all");

  useEffect(() => {
    window.localStorage.setItem(VIEW_STORAGE_KEY, view);
  }, [view]);

  const { data, isPending, error } = useQuery<IntakeRow[], Error>({
    queryKey: ["intakes", "list", "all"],
    queryFn: async () => {
      const { data, error: respError } = await api.GET("/api/intakes", {
        params: { query: { status: "all" } },
      });
      if (respError || !data) throw new Error("intakes fetch failed");
      return data as unknown as IntakeRow[];
    },
  });

  const create = useMutation({
    mutationFn: async (familyId: string) => {
      const { data, error } = await api.POST("/api/intakes", {
        body: { family_id: familyId } as never,
      });
      if (error || !data) {
        const msg =
          (error as { detail?: string } | undefined)?.detail ??
          "Failed to create intake.";
        throw new Error(msg);
      }
      return data as { id: string };
    },
    onSuccess: (intake) => {
      qc.invalidateQueries({ queryKey: ["intakes", "list"] });
      navigate(`/intakes/${intake.id}`);
    },
    onError: (e: Error) => snackbar.show(e.message, "error"),
  });

  if (error) {
    return <Alert severity="error">Failed to load intakes: {error.message}</Alert>;
  }

  const rows = data ?? [];

  const counts = useMemo(() => {
    const c: Record<Bucket, number> = {
      in_progress: 0,
      nurturing: 0,
      converted: 0,
      closed: 0,
      all: rows.length,
    };
    for (const r of rows) {
      if (BUCKET_MATCH.in_progress(r)) c.in_progress++;
      else if (BUCKET_MATCH.nurturing(r)) c.nurturing++;
      else if (BUCKET_MATCH.converted(r)) c.converted++;
      else if (BUCKET_MATCH.closed(r)) c.closed++;
    }
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    if (bucket === "all") return rows;
    return rows.filter(BUCKET_MATCH[bucket]);
  }, [rows, bucket]);

  return (
    <Stack spacing={2}>
      <PageHeader
        title="Intakes"
        subtitle="Initial family meetings. Each intake can spawn one or more engagements."
        actions={
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setPickOpen(true)}
          >
            New intake
          </Button>
        }
      />

      <Box sx={{ display: "flex", justifyContent: "flex-start" }}>
        <ViewPill view={view} onChange={setView} />
      </Box>

      {view === "list" ? (
        <>
          {/* Table view keeps the rollup stat strip (doubles as a filter);
              kanban drops it since each column header shows its own count. */}
          <Box
            sx={{
              display: "grid",
              gap: 2,
              gridTemplateColumns: { xs: "repeat(2, 1fr)", sm: "repeat(4, 1fr)" },
            }}
          >
            {STAT_CARDS.map((card) =>
              isPending ? (
                <Skeleton key={card.key} variant="rounded" height={128} />
              ) : (
                <Tooltip
                  key={card.key}
                  title={PHASE_META[card.key].description}
                  arrow
                >
                  <Box sx={{ height: "100%" }}>
                    <StatCard
                      label={PHASE_META[card.key].label}
                      value={counts[card.key].toLocaleString()}
                      subtitle={card.subtitle}
                      icon={card.icon}
                      // Clicking the active card toggles back to "all" so the
                      // strip doubles as a clear-filter affordance.
                      onClick={() =>
                        setBucket((prev) => (prev === card.key ? "all" : card.key))
                      }
                      sx={
                        bucket === card.key
                          ? { borderColor: "primary.main", borderWidth: 1.5 }
                          : undefined
                      }
                    />
                  </Box>
                </Tooltip>
              ),
            )}
          </Box>

          <ListView
            rows={filtered}
            loading={isPending}
            onNew={() => setPickOpen(true)}
          />
        </>
      ) : (
        <KanbanView rows={rows} loading={isPending} onNew={() => setPickOpen(true)} />
      )}

      <PickOrCreateFamilyDialog
        open={pickOpen}
        title="Start intake"
        continueLabel={create.isPending ? "Creating…" : "Continue"}
        onClose={() => setPickOpen(false)}
        onContinue={(familyId) => {
          setPickOpen(false);
          create.mutate(familyId);
        }}
      />
    </Stack>
  );
}

// ---- View pill ----------------------------------------------------------

function ViewPill({
  view,
  onChange,
}: {
  view: ViewMode;
  onChange: (next: ViewMode) => void;
}) {
  return (
    <ToggleButtonGroup
      value={view}
      exclusive
      onChange={(_, v) => v && onChange(v as ViewMode)}
      size="small"
      sx={{
        bgcolor: "action.hover",
        borderRadius: 999,
        p: 0.25,
        "& .MuiToggleButton-root": {
          px: 2.25,
          py: 0.5,
          border: 0,
          borderRadius: 999,
          textTransform: "none",
          color: "text.secondary",
          fontWeight: 500,
          "&:not(:first-of-type)": { marginLeft: 0 },
        },
        "& .MuiToggleButton-root.Mui-selected": {
          bgcolor: "background.paper",
          color: "text.primary",
          boxShadow: 1,
          "&:hover": { bgcolor: "background.paper" },
        },
      }}
    >
      <Tooltip title="List">
        <ToggleButton value="list" aria-label="List" disableRipple>
          <ViewListIcon fontSize="small" />
        </ToggleButton>
      </Tooltip>
      <Tooltip title="Kanban">
        <ToggleButton value="kanban" aria-label="Kanban" disableRipple>
          <ViewKanbanIcon fontSize="small" />
        </ToggleButton>
      </Tooltip>
    </ToggleButtonGroup>
  );
}

// ---- List view ----------------------------------------------------------

function ListView({
  rows,
  loading,
  onNew,
}: {
  rows: IntakeRow[];
  loading: boolean;
  onNew: () => void;
}) {
  const navigate = useNavigate();
  return (
    <DataTableContainer
      loading={loading}
      loadingColumns={4}
      loadingRows={5}
      empty={!loading && rows.length === 0}
      emptyTitle="No intakes yet"
      emptyDescription="Start the first intake to capture a family meeting."
      emptyAction={
        <Button variant="text" startIcon={<AddIcon />} onClick={onNew}>
          New intake
        </Button>
      }
    >
      <Table size="small" stickyHeader>
        <TableHead>
          <TableRow>
            <TableCell>Family</TableCell>
            <TableCell>Intake date</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Consultant</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow
              key={row.id}
              hover
              sx={{
                cursor: "pointer",
                // Dim closed intakes so the active queue reads first.
                opacity: row.outcome ? 0.7 : 1,
              }}
              onClick={() => navigate(`/intakes/${row.id}`)}
            >
              <TableCell sx={{ fontWeight: 500 }}>{row.household_name}</TableCell>
              <TableCell>{dayjs(row.intake_date).format("MMM D, YYYY")}</TableCell>
              <TableCell>
                <OutcomeChip outcome={row.outcome} convertedAt={row.converted_at} />
              </TableCell>
              <TableCell>
                {row.consultant_name ?? (
                  <Box component="span" sx={{ color: "text.disabled" }}>
                    —
                  </Box>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </DataTableContainer>
  );
}

// ---- Kanban view --------------------------------------------------------

interface KanbanColumnDef {
  key: Exclude<Bucket, "all">;
  match: (row: IntakeRow) => boolean;
}

// Four buckets keyed on what work is actually left:
//   In Progress → no outcome yet, OR outcome='converting' but the
//     convert flow hasn't run (the operator still has to click
//     Convert; the work is unfinished).
//   Converted → outcome='converting' AND converted_at IS NOT NULL —
//     engagement(s) spawned, this intake is done.
//   Nurturing → outcome='nurture'.
//   Closed → any negative terminal outcome (declined / no_response /
//     duplicate).
//
// We intentionally don't show a separate "Converting" column. The
// time between "decided to convert" and "actually converted" is
// usually seconds; surfacing it as its own column adds noise without
// flagging unfinished work the operator needs to revisit. The list
// view still labels those rows "Converting" via OutcomeChip so the
// stated intent stays visible.
//
// Match fns delegate to BUCKET_MATCH so the stat strip and the kanban
// columns can't drift apart.
const KANBAN_COLUMNS: KanbanColumnDef[] = [
  { key: "in_progress", match: BUCKET_MATCH.in_progress },
  { key: "nurturing", match: BUCKET_MATCH.nurturing },
  { key: "converted", match: BUCKET_MATCH.converted },
  { key: "closed", match: BUCKET_MATCH.closed },
];

function KanbanView({
  rows,
  loading,
  onNew,
}: {
  rows: IntakeRow[];
  loading: boolean;
  onNew: () => void;
}) {
  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
        <Typography variant="body2" color="text.disabled">
          Loading…
        </Typography>
      </Box>
    );
  }
  if (rows.length === 0) {
    return (
      <Paper variant="outlined" sx={{ p: 4, textAlign: "center" }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          No intakes yet.
        </Typography>
        <Button variant="text" startIcon={<AddIcon />} onClick={onNew}>
          New intake
        </Button>
      </Paper>
    );
  }
  return (
    <Box
      sx={{
        display: "grid",
        gap: 2,
        gridTemplateColumns: {
          xs: "1fr",
          sm: "repeat(2, minmax(0, 1fr))",
          lg: "repeat(4, minmax(0, 1fr))",
        },
        alignItems: "start",
      }}
    >
      {KANBAN_COLUMNS.map((col) => {
        const colRows = rows.filter(col.match);
        return (
          <KanbanColumn
            key={col.key}
            title={PHASE_META[col.key].label}
            description={PHASE_META[col.key].description}
            count={colRows.length}
          >
            {colRows.length === 0 ? (
              <Typography
                variant="caption"
                color="text.disabled"
                sx={{ fontStyle: "italic" }}
              >
                —
              </Typography>
            ) : (
              colRows.map((row) => <KanbanCard key={row.id} row={row} />)
            )}
          </KanbanColumn>
        );
      })}
    </Box>
  );
}

function KanbanColumn({
  title,
  description,
  count,
  children,
}: {
  title: string;
  description: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <SectionPanel
      title={
        <Tooltip title={description} arrow>
          <Box
            component="span"
            sx={{
              cursor: "help",
              textDecoration: "underline dotted",
              textUnderlineOffset: 3,
            }}
          >
            {title}
          </Box>
        </Tooltip>
      }
      titleVariant="overline"
      count={count}
    >
      <Stack spacing={1} sx={{ p: 1.5 }}>
        {children}
      </Stack>
    </SectionPanel>
  );
}

function KanbanCard({ row }: { row: IntakeRow }) {
  const navigate = useNavigate();
  return (
    <Card
      variant="outlined"
      sx={{
        transition: (t) =>
          t.transitions.create(["border-color", "background-color"]),
        "&:hover": { borderColor: "primary.light", bgcolor: "action.hover" },
      }}
    >
      <CardActionArea onClick={() => navigate(`/intakes/${row.id}`)}>
        <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
          <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.25 }}>
            {row.household_name}
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block", mt: 0.25 }}
          >
            {dayjs(row.intake_date).format("MMM D, YYYY")}
            {row.consultant_name ? ` · ${row.consultant_name}` : ""}
          </Typography>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}

// ---- Shared chip --------------------------------------------------------

// Map MUI's color shorthand from OUTCOME_STATUS_DISPLAY to our
// StatusChip tone vocabulary so the chips render via the soft variant.
const TONE_FOR_COLOR: Record<
  "default" | "primary" | "success" | "warning" | "error",
  "neutral" | "info" | "success" | "warning" | "danger"
> = {
  default: "neutral",
  primary: "info",
  success: "success",
  warning: "warning",
  error: "danger",
};

function OutcomeChip({
  outcome,
  convertedAt,
}: {
  outcome: Outcome | null;
  convertedAt: string | null;
}) {
  if (!outcome) {
    return <StatusChip size="small" label="In progress" tone="info" variant="soft" />;
  }
  // Override the 'Converting' label once the convert flow has actually
  // spawned engagements — at that point the work is done, not in flight.
  if (outcome === "converting" && convertedAt) {
    return <StatusChip size="small" label="Converted" tone="success" variant="soft" />;
  }
  const display = OUTCOME_STATUS_DISPLAY[outcome];
  return (
    <StatusChip
      size="small"
      label={display.label}
      tone={TONE_FOR_COLOR[display.color]}
      variant="soft"
    />
  );
}
