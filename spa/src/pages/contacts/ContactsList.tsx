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
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import SearchIcon from "@mui/icons-material/Search";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../../api/client";
import { DataTableContainer } from "../../components/DataTableContainer";
import { DataToolbar } from "../../components/DataToolbar";
import { PageHeader } from "../../components/PageHeader";
import { useSnackbar } from "../../components/Snackbar";
import { StatusChip } from "../../components/StatusChip";

import { AddContactDialog } from "./AddContactDialog";
import { ContactDrawer } from "./ContactDrawer";

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
  family_is_archived: boolean;
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

const KIND_TONE: Record<PersonRow["kind"], "info" | "success" | "warning" | "neutral"> = {
  guardian: "info",
  student: "success",
  school_worker: "warning",
  other: "neutral",
};

export function ContactsList() {
  const qc = useQueryClient();
  const snackbar = useSnackbar();
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<KindFilter>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

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
      <PageHeader
        title="Contacts"
        subtitle="Everyone in the address book: guardians, students, school workers, and ad-hoc others."
        actions={
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setAddOpen(true)}
          >
            Add contact
          </Button>
        }
      />

      <DataToolbar>
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
      </DataToolbar>

      <DataTableContainer
        loading={isPending}
        loadingColumns={5}
        loadingRows={6}
        empty={!isPending && rows.length === 0}
        emptyTitle="No matching contacts"
        emptyDescription="Adjust the search or type filter to broaden the list."
      >
        <Table size="small" stickyHeader>
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
            {rows.map((p) => (
              <ContactRow
                key={p.id}
                person={p}
                onOpen={() => setOpenId(p.id)}
              />
            ))}
          </TableBody>
        </Table>
      </DataTableContainer>

      {!isPending && rows.length === 500 && (
        <Typography variant="caption" color="text.secondary" sx={{ alignSelf: "flex-end" }}>
          Showing the first 500 — narrow with search or type filter.
        </Typography>
      )}

      <ContactDrawer personId={openId} onClose={() => setOpenId(null)} />
      <AddContactDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={(id) => {
          snackbar.show("Contact added");
          qc.invalidateQueries({ queryKey: ["contacts", "list"] });
          setOpenId(id);
        }}
      />
    </Stack>
  );
}

function ContactRow({
  person: p,
  onOpen,
}: {
  person: PersonRow;
  onOpen: () => void;
}) {
  const fullName = [p.first_name, p.last_name].filter(Boolean).join(" ");
  const archivedTag = p.family_is_archived ? " (archived)" : "";
  const context = (() => {
    if (p.family_household_name && p.kind === "student" && p.current_grade) {
      return `${p.family_household_name}${archivedTag} · ${p.current_grade}`;
    }
    if (p.family_household_name) return `${p.family_household_name}${archivedTag}`;
    if (p.school_name) return p.school_name;
    return null;
  })();
  return (
    <TableRow hover sx={{ cursor: "pointer" }} onClick={onOpen}>
      <TableCell sx={{ fontWeight: 500 }}>{fullName}</TableCell>
      <TableCell>
        <StatusChip
          size="small"
          label={KIND_LABEL[p.kind]}
          tone={KIND_TONE[p.kind]}
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
    </TableRow>
  );
}
