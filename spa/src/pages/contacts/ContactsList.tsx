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
import SearchIcon from "@mui/icons-material/Search";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../../api/client";
import { DataTableContainer } from "../../components/DataTableContainer";
import { DataToolbar } from "../../components/DataToolbar";
import { PageHeader } from "../../components/PageHeader";
import { useSnackbar } from "../../components/Snackbar";

import { AddContactDialog } from "./AddContactDialog";
import { ContactDrawer } from "./ContactDrawer";

// /api/people returns a plain dict in the route — its OpenAPI response
// schema is empty. Hand-typed to the shape the route emits. This page
// now scopes to kind='school_worker' only; guardians/students live
// under Families, platform users under Admin → Users.
interface PersonRow {
  id: string;
  kind: "school_worker";
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  school_id: string | null;
  school_name: string | null;
}

export function ContactsList() {
  const qc = useQueryClient();
  const snackbar = useSnackbar();
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const { data, isPending, error } = useQuery<PersonRow[], Error>({
    queryKey: ["contacts", "list", search.trim()],
    queryFn: async () => {
      const { data, error: respError } = await api.GET("/api/people", {
        params: {
          query: {
            kind: "school_worker",
            search: search.trim() || undefined,
          },
        },
      });
      if (respError || !data) throw new Error("contacts fetch failed");
      return data as unknown as PersonRow[];
    },
  });

  const rows = useMemo(() => data ?? [], [data]);

  if (error) {
    return <Alert severity="error">Failed to load contacts: {error.message}</Alert>;
  }

  return (
    <Stack spacing={2}>
      <PageHeader
        title="Contacts"
        subtitle="School-affiliated professionals — administrators, counselors, learning specialists, and the rest of the people at schools we work with."
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
          placeholder="Search name, email, or role"
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
        loadingColumns={4}
        loadingRows={6}
        empty={!isPending && rows.length === 0}
        emptyTitle="No matching contacts"
        emptyDescription="Try a different search, or add a new contact."
      >
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Email</TableCell>
              <TableCell>Phone</TableCell>
              <TableCell>School</TableCell>
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
          Showing the first 500 — narrow with search.
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
  return (
    <TableRow hover sx={{ cursor: "pointer" }} onClick={onOpen}>
      <TableCell sx={{ fontWeight: 500 }}>{fullName}</TableCell>
      <TableCell sx={{ color: p.email ? undefined : "text.disabled" }}>
        {p.email ?? "—"}
      </TableCell>
      <TableCell sx={{ color: p.phone ? undefined : "text.disabled" }}>
        {p.phone ?? "—"}
      </TableCell>
      <TableCell>
        {p.school_name ?? (
          <Box component="span" sx={{ color: "text.disabled" }}>—</Box>
        )}
      </TableCell>
    </TableRow>
  );
}
