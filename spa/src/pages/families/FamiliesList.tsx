import { useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControlLabel,
  IconButton,
  InputAdornment,
  MenuItem,
  Stack,
  Switch,
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
import UnarchiveOutlinedIcon from "@mui/icons-material/UnarchiveOutlined";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { api } from "../../api/client";
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
  is_archived: boolean;
}

type EngagementFilter = "all" | "active" | "inactive";

export function FamiliesList() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<EngagementFilter>("all");
  const [showArchived, setShowArchived] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<FamilyRow | null>(null);
  const [archiveCascade, setArchiveCascade] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<FamilyRow | null>(null);
  const snackbar = useSnackbar();

  const { data, isPending, error, refetch } = useQuery<FamilyRow[], Error>({
    queryKey: ["families", "list", showArchived],
    queryFn: async () => {
      const { data, error: respError } = await api.GET("/api/families", {
        params: { query: { include_archived: showArchived } },
      });
      if (respError || !data) throw new Error("families fetch failed");
      return data as unknown as FamilyRow[];
    },
  });

  const archive = useMutation({
    mutationFn: async (args: { id: string; cascade: boolean }) => {
      const { error: respError } = await api.DELETE("/api/families/{family_id}", {
        params: {
          path: { family_id: args.id },
          query: { cascade_engagements: args.cascade },
        },
      });
      if (respError) {
        const msg = (respError as { detail?: string }).detail ?? "Archive failed.";
        throw new Error(msg);
      }
    },
    onSuccess: () => {
      const name = archiveTarget?.household_name ?? "Family";
      const tail = archiveCascade ? " (engagements archived too)" : "";
      snackbar.show(`${name} archived${tail}`);
      setArchiveTarget(null);
      setArchiveCascade(false);
      refetch();
    },
    onError: (e: Error) => snackbar.show(e.message, "error"),
  });

  const unarchive = useMutation({
    mutationFn: async (row: FamilyRow) => {
      const { error: respError } = await api.POST(
        "/api/families/{family_id}/unarchive",
        { params: { path: { family_id: row.id } } },
      );
      if (respError) {
        const msg = (respError as { detail?: string }).detail ?? "Unarchive failed.";
        throw new Error(msg);
      }
      return row;
    },
    onSuccess: (row) => {
      snackbar.show(`${row.household_name} restored`);
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
        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
            />
          }
          label="Show archived"
        />
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
                  sx={{
                    cursor: "pointer",
                    // Visually deprioritize archived rows.
                    opacity: f.is_archived ? 0.6 : 1,
                  }}
                  // Navigate via onClick rather than wrapping the row
                  // in a RouterLink — <a> inside <tbody> + <td> inside
                  // <a> is invalid HTML and React 18 warns about it.
                  onClick={() => navigate(`/families/${f.id}`)}
                >
                  <TableCell sx={{ fontWeight: 500 }}>
                    {f.household_name}
                    {f.is_archived && (
                      <StatusChip
                        size="small"
                        label="archived"
                        tone="warning"
                        variant="outlined"
                        sx={{ ml: 1 }}
                      />
                    )}
                  </TableCell>
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
                    {f.is_archived ? (
                      <Tooltip title="Restore from archive">
                        <IconButton
                          size="small"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            unarchive.mutate(f);
                          }}
                          disabled={unarchive.isPending}
                        >
                          <UnarchiveOutlinedIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    ) : (
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
                    )}
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
        onCreated={() => refetch()}
      />
      <ArchiveFamilyDialog
        target={archiveTarget}
        cascade={archiveCascade}
        onCascadeChange={setArchiveCascade}
        pending={archive.isPending}
        onClose={() => {
          setArchiveTarget(null);
          setArchiveCascade(false);
        }}
        onConfirm={() =>
          archiveTarget &&
          archive.mutate({ id: archiveTarget.id, cascade: archiveCascade })
        }
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

// Inline confirm — like ConfirmDialog but with an extra checkbox for
// the cascade-engagements option. Surfaces the active-engagement count
// in the description so the operator knows what they're flipping off.
function ArchiveFamilyDialog({
  target,
  cascade,
  pending,
  onCascadeChange,
  onClose,
  onConfirm,
}: {
  target: FamilyRow | null;
  cascade: boolean;
  pending: boolean;
  onCascadeChange: (v: boolean) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <ArchiveDialogShell
      open={!!target}
      household={target?.household_name ?? "family"}
      activeEngagements={target?.active_engagements ?? 0}
      cascade={cascade}
      pending={pending}
      onCascadeChange={onCascadeChange}
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}

function ArchiveDialogShell({
  open,
  household,
  activeEngagements,
  cascade,
  pending,
  onCascadeChange,
  onClose,
  onConfirm,
}: {
  open: boolean;
  household: string;
  activeEngagements: number;
  cascade: boolean;
  pending: boolean;
  onCascadeChange: (v: boolean) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <DynamicDialog
      open={open}
      title={`Archive ${household}?`}
      pending={pending}
      onClose={onClose}
      onConfirm={onConfirm}
      confirmLabel="Archive"
    >
      <>
        The {household} family will be hidden from listings and reports,
        but every record stays in the database. Restore it later with
        the unarchive action.
      </>
      {activeEngagements > 0 && (
        <FormControlLabel
          sx={{ mt: 2 }}
          control={
            <Checkbox
              checked={cascade}
              onChange={(e) => onCascadeChange(e.target.checked)}
            />
          }
          label={`Also archive ${activeEngagements} active engagement${activeEngagements === 1 ? "" : "s"}`}
        />
      )}
    </DynamicDialog>
  );
}

/** Small wrapper that keeps the dialog chrome consistent with
 *  ConfirmDialog's primitive but allows extra body content. */
function DynamicDialog({
  open,
  title,
  pending,
  onClose,
  onConfirm,
  confirmLabel,
  children,
}: {
  open: boolean;
  title: string;
  pending: boolean;
  onClose: () => void;
  onConfirm: () => void;
  confirmLabel: string;
  children: React.ReactNode;
}) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText component="div">{children}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={pending}>Cancel</Button>
        <Button variant="contained" disabled={pending} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
