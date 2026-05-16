import { useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  InputAdornment,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import SearchIcon from "@mui/icons-material/Search";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { DataTableContainer } from "../../components/DataTableContainer";
import { DataToolbar } from "../../components/DataToolbar";
import { PageHeader } from "../../components/PageHeader";
import { useSnackbar } from "../../components/Snackbar";

import { AddSchoolDialog } from "./AddSchoolDialog";
import { SchoolDrawer } from "./SchoolDrawer";

// /api/schools returns plain dicts; hand-typed to the columns we render.
export interface SchoolRow {
  id: string;
  name: string;
  location: string | null;
  school_type: string | null;
  grade_range_low: string | null;
  grade_range_high: string | null;
  website: string | null;
  visit_count: number;
  contact_count: number;
}

export function SchoolsList() {
  const qc = useQueryClient();
  const snackbar = useSnackbar();
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const { data, isPending, error } = useQuery<SchoolRow[], Error>({
    queryKey: ["schools", "list", search.trim()],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search.trim()) params.set("q", search.trim());
      const url = `/api/schools${params.toString() ? `?${params}` : ""}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("schools fetch failed");
      return (await res.json()) as SchoolRow[];
    },
  });

  const create = useMutation({
    mutationFn: async (name: string): Promise<SchoolRow> => {
      const res = await fetch("/api/schools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(
          (json as { detail?: string }).detail ?? "Failed to create school.",
        );
      }
      return (await res.json()) as SchoolRow;
    },
    onSuccess: (school) => {
      snackbar.show("School added");
      qc.invalidateQueries({ queryKey: ["schools", "list"] });
      setOpenId(school.id);
    },
    onError: (e: Error) => snackbar.show(e.message, "error"),
  });

  const rows = useMemo(() => data ?? [], [data]);

  if (error) {
    return <Alert severity="error">Failed to load schools: {error.message}</Alert>;
  }

  return (
    <Stack spacing={2}>
      <PageHeader
        title="Schools"
        subtitle="The catalog of schools we work with — recommendations, visits, and key contacts roll up here."
        actions={
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setAddOpen(true)}
          >
            Add school
          </Button>
        }
      />

      <DataToolbar>
        <TextField
          size="small"
          placeholder="Search name or location"
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
      </DataToolbar>

      <DataTableContainer
        loading={isPending}
        loadingColumns={6}
        loadingRows={6}
        empty={!isPending && rows.length === 0}
        emptyTitle="No schools yet"
        emptyDescription="Add a school to start tracking visits, contacts, and recommendations."
        emptyAction={
          <Button variant="text" startIcon={<AddIcon />} onClick={() => setAddOpen(true)}>
            Add school
          </Button>
        }
      >
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Location</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Grades</TableCell>
              <TableCell align="right">Visits</TableCell>
              <TableCell align="right">Contacts</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((s) => (
              <SchoolListRow
                key={s.id}
                school={s}
                onOpen={() => setOpenId(s.id)}
              />
            ))}
          </TableBody>
        </Table>
      </DataTableContainer>

      {!isPending && rows.length >= 500 && (
        <Typography variant="caption" color="text.secondary" sx={{ alignSelf: "flex-end" }}>
          Showing the first 500 — narrow with search.
        </Typography>
      )}

      <SchoolDrawer schoolId={openId} onClose={() => setOpenId(null)} />
      <AddSchoolDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSubmit={(name) => {
          setAddOpen(false);
          create.mutate(name);
        }}
        submitting={create.isPending}
      />
    </Stack>
  );
}

function SchoolListRow({
  school: s,
  onOpen,
}: {
  school: SchoolRow;
  onOpen: () => void;
}) {
  const grades = (() => {
    if (s.grade_range_low && s.grade_range_high) {
      return `${s.grade_range_low}–${s.grade_range_high}`;
    }
    return s.grade_range_low || s.grade_range_high || null;
  })();
  return (
    <TableRow hover sx={{ cursor: "pointer" }} onClick={onOpen}>
      <TableCell sx={{ fontWeight: 500 }}>
        <Stack direction="row" spacing={0.75} alignItems="center">
          <Box component="span">{s.name}</Box>
          {s.website && (
            <Box
              component="a"
              href={s.website}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
              sx={{
                display: "inline-flex",
                color: "text.disabled",
                "&:hover": { color: "primary.main" },
              }}
            >
              <OpenInNewIcon fontSize="inherit" />
            </Box>
          )}
        </Stack>
      </TableCell>
      <TableCell sx={{ color: s.location ? undefined : "text.disabled" }}>
        {s.location ?? "—"}
      </TableCell>
      <TableCell sx={{ color: s.school_type ? undefined : "text.disabled" }}>
        {s.school_type ?? "—"}
      </TableCell>
      <TableCell sx={{ color: grades ? undefined : "text.disabled" }}>
        {grades ?? "—"}
      </TableCell>
      <TableCell align="right" sx={{ color: s.visit_count ? undefined : "text.disabled" }}>
        {s.visit_count}
      </TableCell>
      <TableCell align="right" sx={{ color: s.contact_count ? undefined : "text.disabled" }}>
        {s.contact_count}
      </TableCell>
    </TableRow>
  );
}
