import { useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
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
import { useQuery } from "@tanstack/react-query";
import { Link as RouterLink } from "react-router-dom";

import { api } from "../../api/client";
import { DataTableContainer } from "../../components/DataTableContainer";
import { DataToolbar } from "../../components/DataToolbar";
import { PageHeader } from "../../components/PageHeader";
import { StatusChip } from "../../components/StatusChip";

import { AddFamilyDialog } from "./AddFamilyDialog";

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

  const { data, isPending, error, refetch } = useQuery<FamilyRow[], Error>({
    queryKey: ["families", "list"],
    queryFn: async () => {
      const { data, error: respError } = await api.GET("/api/families");
      if (respError || !data) throw new Error("families fetch failed");
      return data as unknown as FamilyRow[];
    },
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
    </Stack>
  );
}
