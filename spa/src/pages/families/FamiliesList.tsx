import { useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  IconButton,
  InputAdornment,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import ArchiveOutlinedIcon from "@mui/icons-material/ArchiveOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import SearchIcon from "@mui/icons-material/Search";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link as RouterLink } from "react-router-dom";

import { api } from "../../api/client";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { DataTableContainer } from "../../components/DataTableContainer";
import { DataToolbar } from "../../components/DataToolbar";
import { PageHeader } from "../../components/PageHeader";
import { useSnackbar } from "../../components/Snackbar";
import { StatusChip } from "../../components/StatusChip";

import { AddFamilyDialog } from "./AddFamilyDialog";
import { DeleteFamilyDialog } from "./DeleteFamilyDialog";

// /api/families returns a plain dict in the route — its OpenAPI schema
// is empty. Hand-typed here so the table column accesses are safe.
interface FamilyRow {
  id: string;
  household_name: string;
  primary_parent_id: string | null;
  primary_parent_name: string | null;
  student_count: number;
  parent_count: number;
  active_engagements: number;
}

type EngagementFilter = "all" | "active" | "inactive";

export function FamiliesList() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<EngagementFilter>("all");
  const [addOpen, setAddOpen] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<FamilyRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FamilyRow | null>(null);
  const snackbar = useSnackbar();

  const { data, isPending, error, refetch } = useQuery<FamilyRow[], Error>({
    queryKey: ["families", "list"],
    queryFn: async () => {
      const { data, error: respError } = await api.GET("/api/families");
      if (respError || !data) throw new Error("families fetch failed");
      return data as unknown as FamilyRow[];
    },
  });

  const archive = useMutation({
    mutationFn: async (id: string) => {
      const { error: respError } = await api.DELETE("/api/families/{family_id}", {
        params: { path: { family_id: id } },
      });
      if (respError) {
        const msg = (respError as { detail?: string }).detail ?? "Archive failed.";
        throw new Error(msg);
      }
    },
    onSuccess: () => {
      const name = archiveTarget?.household_name ?? "Family";
      snackbar.show(`${name} archived`);
      setArchiveTarget(null);
      refetch();
    },
    onError: (e: Error) => snackbar.show(e.message, "error"),
  });

  // Lightweight client-side filter — list size is small (homelab scale)
  // and the search-as-you-type latency this avoids isn't worth a server
  // round-trip.
  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.filter((f) => {
      if (q && !f.household_name.toLowerCase().includes(q)
          && !(f.primary_parent_name?.toLowerCase().includes(q))) {
        return false;
      }
      if (filter === "active" && f.active_engagements === 0) return false;
      if (filter === "inactive" && f.active_engagements > 0) return false;
      return true;
    });
  }, [data, search, filter]);

  if (error) {
    return <Alert severity="error">Failed to load families: {error.message}</Alert>;
  }

  return (
    <Stack spacing={2}>
      <PageHeader
        title="Families"
        subtitle="Households, guardians, students, and active engagements."
        actions={
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setAddOpen(true)}
          >
            Add family
          </Button>
        }
      />

      <DataToolbar>
        <TextField
          size="small"
          placeholder="Search by household or primary contact"
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
          label="Engagements"
          value={filter}
          onChange={(e) => setFilter(e.target.value as EngagementFilter)}
          sx={{ minWidth: 160 }}
        >
          <MenuItem value="all">All</MenuItem>
          <MenuItem value="active">With active</MenuItem>
          <MenuItem value="inactive">Without active</MenuItem>
        </TextField>
      </DataToolbar>

      <DataTableContainer
        loading={isPending}
        loadingColumns={4}
        loadingRows={5}
        empty={!isPending && filtered.length === 0}
        emptyTitle={data && data.length === 0 ? "No families yet" : "No matching families"}
        emptyDescription={
          data && data.length === 0
            ? "Add the first household to start building contacts and students."
            : "Adjust the search or engagement filter to broaden the list."
        }
        emptyAction={
          data && data.length === 0 ? (
            <Button
              variant="text"
              startIcon={<AddIcon />}
              onClick={() => setAddOpen(true)}
            >
              Add the first family
            </Button>
          ) : undefined
        }
      >
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell>Household</TableCell>
              <TableCell>Primary contact</TableCell>
              <TableCell align="right">Students</TableCell>
              <TableCell align="right">Active engagements</TableCell>
              <TableCell align="right" sx={{ width: 110 }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.map((f) => (
                <TableRow
                  key={f.id}
                  hover
                  sx={{ cursor: "pointer" }}
                  component={RouterLink}
                  to={`/families/${f.id}`}
                  style={{ textDecoration: "none" }}
                >
                  <TableCell sx={{ fontWeight: 500 }}>{f.household_name}</TableCell>
                  <TableCell>
                    {f.primary_parent_name ?? (
                      <Box component="span" sx={{ color: "text.disabled" }}>
                        not set
                      </Box>
                    )}
                  </TableCell>
                  <TableCell align="right">{f.student_count}</TableCell>
                  <TableCell align="right">
                    {f.active_engagements > 0 ? (
                      <StatusChip
                        size="small"
                        label={f.active_engagements}
                        tone="info"
                        variant="outlined"
                      />
                    ) : (
                      <Box component="span" sx={{ color: "text.disabled" }}>—</Box>
                    )}
                  </TableCell>
                  <TableCell align="right">
                    {/* Stop both click + keyboard activation from
                        bubbling — the row itself is a RouterLink. */}
                    <Tooltip title="Archive (soft delete)">
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setArchiveTarget(f);
                        }}
                      >
                        <ArchiveOutlinedIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete permanently">
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setDeleteTarget(f);
                        }}
                        sx={{ color: "error.main" }}
                      >
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </DataTableContainer>

      <AddFamilyDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={refetch}
      />
      <ConfirmDialog
        open={!!archiveTarget}
        title={`Archive ${archiveTarget?.household_name ?? "family"}?`}
        description={
          <>
            The {archiveTarget?.household_name} family will be hidden from
            listings and reports, but every record stays in the database.
            You can restore it later by clearing its <code>deleted_at</code>.
          </>
        }
        confirmLabel="Archive"
        pending={archive.isPending}
        onClose={() => setArchiveTarget(null)}
        onConfirm={() => archiveTarget && archive.mutate(archiveTarget.id)}
      />
      <DeleteFamilyDialog
        target={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDeleted={() => {
          const name = deleteTarget?.household_name ?? "Family";
          snackbar.show(`${name} family deleted`);
          setDeleteTarget(null);
          refetch();
        }}
      />
    </Stack>
  );
}
