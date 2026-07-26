import {
  Alert,
  Button,
  Link as MuiLink,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import TaskAltOutlinedIcon from "@mui/icons-material/TaskAltOutlined";
import dayjs from "dayjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link as RouterLink, useSearchParams } from "react-router-dom";

import { DataTableContainer } from "../../components/DataTableContainer";
import { PageHeader } from "../../components/PageHeader";
import { useSnackbar } from "../../components/Snackbar";
import { StatusChip } from "../../components/StatusChip";

interface FollowupRow {
  id: string;
  engagement_id: string;
  family_id: string;
  household_name: string;
  title: string;
  body: string | null;
  due_date: string;
  status: "open" | "done" | "cancelled";
  completed_at: string | null;
  assignee_id: string | null;
  assignee_name: string;
}

type StatusFilter = "open" | "done" | "all";

const STATUS_TABS: Array<{ value: StatusFilter; label: string }> = [
  { value: "open", label: "Open" },
  { value: "done", label: "Done" },
  { value: "all", label: "All" },
];

function parseStatus(value: string | null): StatusFilter {
  return STATUS_TABS.some((tab) => tab.value === value)
    ? (value as StatusFilter)
    : "open";
}

const STATUS_TONE: Record<FollowupRow["status"], "info" | "success" | "neutral"> = {
  open: "info",
  done: "success",
  cancelled: "neutral",
};

/** Cross-engagement followups — the destination for the dashboard's
 *  My Followups / Overdue Followups cards. URL params: status
 *  (open/done/all), assignee (me/all), due=overdue. */
export function FollowupsList() {
  const qc = useQueryClient();
  const snackbar = useSnackbar();
  const [params, setParams] = useSearchParams();
  const status = parseStatus(params.get("status"));
  const assignee = params.get("assignee") === "all" ? "all" : "me";
  const overdueOnly = params.get("due") === "overdue";

  const updateParams = (updates: Record<string, string | null>) => {
    setParams((current) => {
      const next = new URLSearchParams(current);
      for (const [key, value] of Object.entries(updates)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      return next;
    }, { replace: true });
  };

  const followups = useQuery<FollowupRow[], Error>({
    queryKey: ["followups", "list", { status, assignee, overdueOnly }],
    queryFn: async () => {
      const search = new URLSearchParams({ status, assignee });
      if (overdueOnly) search.set("overdue", "true");
      const res = await fetch(`/api/followups?${search}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load followups.");
      return (await res.json()) as FollowupRow[];
    },
  });

  const markDone = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/followups/${id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: "done" }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error((json as { detail?: string }).detail ?? "Update failed.");
      }
    },
    onSuccess: () => {
      snackbar.show("Followup marked done");
      qc.invalidateQueries({ queryKey: ["followups", "list"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e: Error) => snackbar.show(e.message, "error"),
  });

  const rows = followups.data ?? [];
  const today = dayjs().startOf("day");
  const isOverdue = (row: FollowupRow) =>
    row.status === "open" && dayjs(row.due_date).isBefore(today, "day");

  if (followups.error) {
    return (
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" onClick={() => followups.refetch()}>
            Retry
          </Button>
        }
      >
        Failed to load followups: {followups.error.message}
      </Alert>
    );
  }

  return (
    <Stack spacing={2.5}>
      <PageHeader
        title="Followups"
        subtitle="Open items across every engagement, sorted by due date."
      />

      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={1.5}
        alignItems={{ sm: "center" }}
      >
        <Tabs
          value={status}
          // Leaving the Open tab drops due=overdue — it only means
          // something for open items (same rule as the invoices list).
          onChange={(_e, value: StatusFilter) =>
            updateParams({ status: value === "open" ? null : value, due: null })
          }
          sx={{ borderBottom: 1, borderColor: "divider", flex: 1 }}
        >
          {STATUS_TABS.map((tab) => (
            <Tab key={tab.value} value={tab.value} label={tab.label} />
          ))}
        </Tabs>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={assignee}
          onChange={(_e, value: "me" | "all" | null) => {
            if (value) updateParams({ assignee: value === "me" ? null : value });
          }}
          aria-label="Assignee filter"
        >
          <ToggleButton value="me">Mine</ToggleButton>
          <ToggleButton value="all">Everyone</ToggleButton>
        </ToggleButtonGroup>
        <ToggleButton
          size="small"
          value="overdue"
          selected={overdueOnly}
          disabled={status !== "open"}
          onChange={() => updateParams({ due: overdueOnly ? null : "overdue" })}
          color="error"
        >
          Overdue only
        </ToggleButton>
      </Stack>

      <DataTableContainer
        loading={followups.isPending}
        loadingColumns={5}
        empty={rows.length === 0}
        emptyTitle={overdueOnly ? "Nothing overdue" : "No followups here"}
        emptyDescription={
          overdueOnly
            ? "Every open followup is still within its due date."
            : "Followups added on engagements will appear here."
        }
      >
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Due</TableCell>
              <TableCell>Followup</TableCell>
              <TableCell>Household</TableCell>
              <TableCell>Assignee</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right" />
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id} hover>
                <TableCell
                  sx={{
                    whiteSpace: "nowrap",
                    color: isOverdue(row) ? "error.main" : undefined,
                    fontWeight: isOverdue(row) ? 650 : undefined,
                  }}
                >
                  {dayjs(row.due_date).format("MMM D, YYYY")}
                </TableCell>
                <TableCell>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {row.title}
                  </Typography>
                  {row.body && (
                    <Typography variant="caption" color="text.secondary">
                      {row.body}
                    </Typography>
                  )}
                </TableCell>
                <TableCell>
                  <MuiLink
                    component={RouterLink}
                    to={`/engagements/${row.engagement_id}`}
                    underline="hover"
                  >
                    {row.household_name}
                  </MuiLink>
                </TableCell>
                <TableCell>{row.assignee_name || "—"}</TableCell>
                <TableCell>
                  <StatusChip
                    size="small"
                    variant="soft"
                    tone={isOverdue(row) ? "danger" : STATUS_TONE[row.status]}
                    label={isOverdue(row) ? "Overdue" : row.status}
                  />
                </TableCell>
                <TableCell align="right">
                  {row.status === "open" && (
                    <Tooltip title="Mark done">
                      <Button
                        size="small"
                        startIcon={<TaskAltOutlinedIcon fontSize="small" />}
                        onClick={() => markDone.mutate(row.id)}
                        disabled={markDone.isPending}
                      >
                        Done
                      </Button>
                    </Tooltip>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DataTableContainer>
    </Stack>
  );
}
