import { useMemo, useState } from "react";
import {
  Alert,
  Box,
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
import SearchIcon from "@mui/icons-material/Search";
import { useQuery } from "@tanstack/react-query";
import { Link as RouterLink } from "react-router-dom";

import { api } from "../../api/client";

// /api/people returns a plain dict in the route — its OpenAPI response
// schema is empty. Hand-typed to the shape the route emits; if that
// shape ever grows a Pydantic response_model the type comes from
// schema.ts via `components["schemas"][...]` instead.
interface PersonRow {
  id: string;
  kind: "guardian" | "student" | "school_worker" | "other";
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  family_id: string | null;
  family_household_name: string | null;
  school_id: string | null;
  school_name: string | null;
  current_grade: string | null;
}

type KindFilter = "all" | PersonRow["kind"];

const KIND_LABEL: Record<PersonRow["kind"], string> = {
  guardian: "Guardian",
  student: "Student",
  school_worker: "School worker",
  other: "Other",
};

const KIND_COLOR: Record<PersonRow["kind"], "primary" | "success" | "warning" | "default"> = {
  guardian: "primary",
  student: "success",
  school_worker: "warning",
  other: "default",
};

export function ContactsList() {
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<KindFilter>("all");

  const { data, isPending, error } = useQuery<PersonRow[], Error>({
    queryKey: ["contacts", "list", kind, search.trim()],
    queryFn: async () => {
      const { data, error: respError } = await api.GET("/api/people", {
        params: {
          query: {
            kind: kind === "all" ? undefined : kind,
            search: search.trim() || undefined,
          },
        },
      });
      if (respError || !data) throw new Error("contacts fetch failed");
      return data as unknown as PersonRow[];
    },
  });

  // Server already filters; keeping a memoized identity here so the
  // table re-render path is stable across data refetches.
  const rows = useMemo(() => data ?? [], [data]);

  if (error) {
    return <Alert severity="error">Failed to load contacts: {error.message}</Alert>;
  }

  return (
    <Stack spacing={2}>
      <Typography variant="h4">Contacts</Typography>
      <Typography variant="body2" color="text.secondary">
        Everyone in the address book — guardians from families, students,
        school workers, and ad-hoc others. Click into a row to jump to
        the relevant detail page.
      </Typography>

      <Stack direction="row" spacing={2} alignItems="center">
        <TextField
          size="small"
          placeholder="Search name or email"
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
          label="Type"
          value={kind}
          onChange={(e) => setKind(e.target.value as KindFilter)}
          sx={{ minWidth: 180 }}
        >
          <MenuItem value="all">All</MenuItem>
          <MenuItem value="guardian">Guardians</MenuItem>
          <MenuItem value="student">Students</MenuItem>
          <MenuItem value="school_worker">School workers</MenuItem>
          <MenuItem value="other">Other</MenuItem>
        </TextField>
      </Stack>

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Email</TableCell>
              <TableCell>Phone</TableCell>
              <TableCell>Context</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isPending ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 5 }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton width="80%" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5}>
                  <Box sx={{ py: 6, textAlign: "center" }}>
                    <Typography color="text.secondary">
                      No contacts match the current filters.
                    </Typography>
                  </Box>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((p) => (
                <ContactRow key={p.id} person={p} />
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {!isPending && rows.length === 500 && (
        <Typography variant="caption" color="text.secondary" sx={{ alignSelf: "flex-end" }}>
          Showing the first 500 — narrow with search or type filter.
        </Typography>
      )}
    </Stack>
  );
}

function ContactRow({ person: p }: { person: PersonRow }) {
  // Each kind links to its appropriate detail page; school_worker has
  // no detail page yet, so it stays a non-link until the schools work
  // adds /schools/{id}/contacts/{id}.
  const linkTo =
    p.kind === "guardian" || p.kind === "student"
      ? p.family_id
        ? `/families/${p.family_id}`
        : null
      : null;
  const fullName = [p.first_name, p.last_name].filter(Boolean).join(" ");
  const context = (() => {
    if (p.family_household_name && p.kind === "student" && p.current_grade) {
      return `${p.family_household_name} · ${p.current_grade}`;
    }
    if (p.family_household_name) return p.family_household_name;
    if (p.school_name) return p.school_name;
    return null;
  })();
  const cellContent = (
    <>
      <TableCell sx={{ fontWeight: 500 }}>{fullName}</TableCell>
      <TableCell>
        <Chip
          size="small"
          label={KIND_LABEL[p.kind]}
          color={KIND_COLOR[p.kind]}
          variant="outlined"
        />
      </TableCell>
      <TableCell sx={{ color: p.email ? undefined : "text.disabled" }}>
        {p.email ?? "—"}
      </TableCell>
      <TableCell sx={{ color: p.phone ? undefined : "text.disabled" }}>
        {p.phone ?? "—"}
      </TableCell>
      <TableCell>
        {context ?? (
          <Box component="span" sx={{ color: "text.disabled" }}>—</Box>
        )}
      </TableCell>
    </>
  );
  return linkTo ? (
    <TableRow
      hover
      sx={{ cursor: "pointer" }}
      component={RouterLink}
      to={linkTo}
      style={{ textDecoration: "none" }}
    >
      {cellContent}
    </TableRow>
  ) : (
    <TableRow>{cellContent}</TableRow>
  );
}
