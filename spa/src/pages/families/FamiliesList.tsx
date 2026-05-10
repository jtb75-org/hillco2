import { useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  InputAdornment,
  MenuItem,
  Paper,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import SearchIcon from "@mui/icons-material/Search";
import { useQuery } from "@tanstack/react-query";
import { Link as RouterLink } from "react-router-dom";

import { api } from "../../api/client";

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
      <Stack direction="row" alignItems="center" spacing={2}>
        <Typography variant="h4" sx={{ flex: 1 }}>Families</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setAddOpen(true)}
        >
          Add family
        </Button>
      </Stack>

      <Stack direction="row" spacing={2} alignItems="center">
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
      </Stack>

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Household</TableCell>
              <TableCell>Primary contact</TableCell>
              <TableCell align="right">Students</TableCell>
              <TableCell align="right">Active engagements</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isPending ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 4 }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton width="80%" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4}>
                  <Box sx={{ py: 6, textAlign: "center" }}>
                    <Typography color="text.secondary" sx={{ mb: 1 }}>
                      {data && data.length === 0
                        ? "No families yet."
                        : "No matches for the current filters."}
                    </Typography>
                    {data && data.length === 0 && (
                      <Button
                        variant="text"
                        startIcon={<AddIcon />}
                        onClick={() => setAddOpen(true)}
                      >
                        Add the first family
                      </Button>
                    )}
                  </Box>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((f) => (
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
                      <Chip
                        size="small"
                        label={f.active_engagements}
                        color="primary"
                        variant="outlined"
                      />
                    ) : (
                      <Box component="span" sx={{ color: "text.disabled" }}>—</Box>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <AddFamilyDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={refetch}
      />
    </Stack>
  );
}
