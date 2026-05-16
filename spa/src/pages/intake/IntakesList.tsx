import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import dayjs from "dayjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { api } from "../../api/client";
import { DataTableContainer } from "../../components/DataTableContainer";
import { PageHeader } from "../../components/PageHeader";
import { useSnackbar } from "../../components/Snackbar";

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
  created_at: string;
}

type ViewMode = "list" | "kanban";
const VIEW_STORAGE_KEY = "intakesView";

function loadInitialView(): ViewMode {
  if (typeof window === "undefined") return "list";
  const v = window.localStorage.getItem(VIEW_STORAGE_KEY);
  return v === "kanban" ? "kanban" : "list";
}

export function IntakesList() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const snackbar = useSnackbar();
  const [pickOpen, setPickOpen] = useState(false);
  const [view, setView] = useState<ViewMode>(() => loadInitialView());

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
        <ListView rows={rows} loading={isPending} onNew={() => setPickOpen(true)} />
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
      <ToggleButton value="list" disableRipple>
        List
      </ToggleButton>
      <ToggleButton value="kanban" disableRipple>
        Kanban
      </ToggleButton>
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
                <OutcomeChip outcome={row.outcome} />
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
  key: string;
  title: string;
  match: (row: IntakeRow) => boolean;
}

// Four buckets keyed on the outcome lifecycle the consultant works
// through: open → either converting (becomes an engagement) → nurturing
// (follow up later) → closed (declined / no_response / duplicate).
const KANBAN_COLUMNS: KanbanColumnDef[] = [
  { key: "in_progress", title: "In Progress", match: (r) => r.outcome == null },
  { key: "converting", title: "Converting", match: (r) => r.outcome === "converting" },
  { key: "nurturing", title: "Nurturing", match: (r) => r.outcome === "nurture" },
  {
    key: "closed",
    title: "Closed",
    match: (r) =>
      r.outcome != null && r.outcome !== "converting" && r.outcome !== "nurture",
  },
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
          <KanbanColumn key={col.key} title={col.title} count={colRows.length}>
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
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <Paper
      variant="outlined"
      sx={{
        p: 1.5,
        bgcolor: "background.default",
        display: "flex",
        flexDirection: "column",
        gap: 1,
      }}
    >
      <Stack direction="row" alignItems="baseline" spacing={1} sx={{ px: 0.5 }}>
        <Typography variant="overline" sx={{ fontWeight: 700, letterSpacing: 0.5 }}>
          {title}
        </Typography>
        <Typography variant="caption" color="text.disabled">
          ({count})
        </Typography>
      </Stack>
      <Stack spacing={1}>{children}</Stack>
    </Paper>
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

function OutcomeChip({ outcome }: { outcome: Outcome | null }) {
  if (!outcome) {
    return (
      <Chip size="small" label="In progress" color="primary" variant="outlined" />
    );
  }
  const display = OUTCOME_STATUS_DISPLAY[outcome];
  return <Chip size="small" label={display.label} color={display.color} />;
}
