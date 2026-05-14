import { useMemo, useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import SearchIcon from "@mui/icons-material/Search";
import dayjs from "dayjs";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { api } from "../../api/client";
import { DataTableContainer } from "../../components/DataTableContainer";
import { DataToolbar } from "../../components/DataToolbar";
import { PageHeader } from "../../components/PageHeader";
import { StatusChip } from "../../components/StatusChip";

// GET /api/engagements returns a plain list of dicts — hand-typed for
// the columns we render. Backend selects student_id/student_name so the
// table can show whose engagement this is without a per-row roundtrip.
interface EngagementRow {
  id: string;
  engagement_type: string;
  status: "in_progress" | "on_hold" | "completed" | "cancelled";
  start_date: string | null;
  target_end_date: string | null;
  default_hourly_rate: string | null;
  family_id: string;
  household_name: string;
  student_id: string | null;
  student_name: string | null;
  lead_consultant_id: string | null;
  lead_consultant_name: string | null;
}

// Backend supports active|completed|cancelled|all; "active" pulls
// in_progress + on_hold. Match the API's filter values exactly.
type StatusFilter = "active" | "completed" | "cancelled" | "all";

export function EngagementsList() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<StatusFilter>("active");
  const [search, setSearch] = useState("");
  const [startOpen, setStartOpen] = useState(false);

  const { data, isPending, error } = useQuery<EngagementRow[], Error>({
    queryKey: ["engagements", "list", status],
    queryFn: async () => {
      const { data, error: respError } = await api.GET("/api/engagements", {
        params: { query: { status } },
      });
      if (respError || !data) throw new Error("engagements fetch failed");
      return data as unknown as EngagementRow[];
    },
  });

  // Lightweight client-side filter — list size is small (homelab scale)
  // and the search-as-you-type latency this avoids isn't worth a server
  // round-trip.
  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data;
    return data.filter((e) =>
      e.household_name.toLowerCase().includes(q) ||
      (e.student_name?.toLowerCase().includes(q) ?? false) ||
      (e.lead_consultant_name?.toLowerCase().includes(q) ?? false) ||
      e.engagement_type.toLowerCase().includes(q),
    );
  }, [data, search]);

  if (error) {
    return <Alert severity="error">Failed to load engagements: {error.message}</Alert>;
  }

  return (
    <Stack spacing={2}>
      <PageHeader
        title="Engagements"
        subtitle="Every assessment and placement engagement across the practice."
        actions={
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setStartOpen(true)}
          >
            Start engagement
          </Button>
        }
      />

      <DataToolbar>
        <TextField
          size="small"
          placeholder="Search by family, student, lead, or type"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ flex: 1, maxWidth: 480 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
        />
        <TextField
          size="small"
          select
          label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value as StatusFilter)}
          sx={{ minWidth: 160 }}
        >
          <MenuItem value="active">Active</MenuItem>
          <MenuItem value="completed">Completed</MenuItem>
          <MenuItem value="cancelled">Cancelled</MenuItem>
          <MenuItem value="all">All</MenuItem>
        </TextField>
      </DataToolbar>

      <DataTableContainer
        loading={isPending}
        loadingColumns={6}
        loadingRows={5}
        empty={!isPending && filtered.length === 0}
        emptyTitle={data && data.length === 0 ? "No engagements" : "No matching engagements"}
        emptyDescription={
          data && data.length === 0
            ? "Start the first engagement from a family page or the button above."
            : "Adjust the search or status filter to broaden the list."
        }
      >
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell>Family</TableCell>
              <TableCell>Student</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Started</TableCell>
              <TableCell>Target end</TableCell>
              <TableCell>Lead</TableCell>
              <TableCell align="right">Rate</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.map((e) => (
              <TableRow
                key={e.id}
                hover
                sx={{ cursor: "pointer" }}
                onClick={() => navigate(`/engagements/${e.id}`)}
              >
                <TableCell sx={{ fontWeight: 500 }}>{e.household_name}</TableCell>
                <TableCell>
                  {e.student_name ?? (
                    <Box component="span" sx={{ color: "text.disabled" }}>—</Box>
                  )}
                </TableCell>
                <TableCell>{labelForType(e.engagement_type)}</TableCell>
                <TableCell>
                  <StatusChip
                    size="small"
                    label={e.status.replace(/_/g, " ")}
                    tone={toneForStatus(e.status)}
                    variant="outlined"
                  />
                </TableCell>
                <TableCell>
                  {e.start_date
                    ? dayjs(e.start_date).format("MMM D, YYYY")
                    : <Box component="span" sx={{ color: "text.disabled" }}>—</Box>}
                </TableCell>
                <TableCell>
                  {e.target_end_date
                    ? dayjs(e.target_end_date).format("MMM D, YYYY")
                    : <Box component="span" sx={{ color: "text.disabled" }}>—</Box>}
                </TableCell>
                <TableCell>
                  {e.lead_consultant_name ?? (
                    <Box component="span" sx={{ color: "text.disabled" }}>—</Box>
                  )}
                </TableCell>
                <TableCell align="right">
                  {e.default_hourly_rate
                    ? `$${e.default_hourly_rate}/hr`
                    : <Box component="span" sx={{ color: "text.disabled" }}>—</Box>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DataTableContainer>

      <PickFamilyDialog
        open={startOpen}
        onClose={() => setStartOpen(false)}
        onPicked={(familyId) => {
          setStartOpen(false);
          navigate(`/families/${familyId}?new=engagement`);
        }}
      />
    </Stack>
  );
}

// Tiny family-picker. Routing the user back to /families/:id and
// letting FamilyDetail open its existing NewEngagementDialog avoids
// duplicating the create flow on this page.
function PickFamilyDialog({
  open,
  onClose,
  onPicked,
}: {
  open: boolean;
  onClose: () => void;
  onPicked: (familyId: string) => void;
}) {
  const families = useQuery<Array<{ id: string; household_name: string }>, Error>({
    queryKey: ["families", "picker"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await api.GET("/api/families", {
        params: { query: { include_archived: false } },
      });
      if (error || !data) throw new Error("families fetch failed");
      return data as unknown as Array<{ id: string; household_name: string }>;
    },
  });
  const [picked, setPicked] = useState<{ id: string; household_name: string } | null>(null);
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Start engagement</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ mt: 1 }}>
          <Autocomplete
            options={families.data ?? []}
            loading={families.isPending}
            value={picked}
            onChange={(_e, v) => setPicked(v)}
            getOptionLabel={(o) => o.household_name}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            renderInput={(params) => (
              <TextField {...params} label="Family" autoFocus />
            )}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!picked}
          onClick={() => picked && onPicked(picked.id)}
        >
          Continue
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function toneForStatus(s: EngagementRow["status"]): "info" | "success" | "warning" | "neutral" {
  switch (s) {
    case "in_progress":
      return "info";
    case "completed":
      return "success";
    case "on_hold":
      return "warning";
    case "cancelled":
      return "neutral";
  }
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
