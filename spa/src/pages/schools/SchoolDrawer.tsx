import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  Drawer,
  IconButton,
  Link as MuiLink,
  Stack,
  TextField,
  Toolbar,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { LabeledField } from "../../components/LabeledField";
import { ghostFieldSx } from "../../components/ghostFieldSx";
import { useSnackbar } from "../../components/Snackbar";

interface SchoolDetail {
  id: string;
  name: string;
  location: string | null;
  school_type: string | null;
  grade_range_low: string | null;
  grade_range_high: string | null;
  website: string | null;
  fit_profile: string | null;
  notes: string | null;
  staff: {
    id: string;
    name: string;
    role: string | null;
    email: string | null;
    phone: string | null;
  }[];
  visits: {
    id: string;
    visit_date: string | null;
    family_id: string;
    household_name: string;
    engagement_id: string;
  }[];
  recommendations: {
    id: string;
    rank: number | null;
    status: string | null;
    family_id: string;
    household_name: string;
    engagement_id: string;
    created_at: string;
  }[];
}

/**
 * Right-slide editor for one school. Loads details (basic info + staff
 * + visits + recommendations) and exposes ghost-style fields for the
 * editable columns. Deletion soft-deletes the school; the school stays
 * referenced by visits / recommendations but disappears from listings.
 */
export function SchoolDrawer({
  schoolId,
  onClose,
}: {
  schoolId: string | null;
  onClose: () => void;
}) {
  const open = !!schoolId;
  const qc = useQueryClient();
  const snackbar = useSnackbar();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data, isPending, error } = useQuery<SchoolDetail, Error>({
    queryKey: ["schools", "detail", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const res = await fetch(`/api/schools/${schoolId}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load school.");
      return (await res.json()) as SchoolDetail;
    },
  });

  const patch = useMutation({
    mutationFn: async (body: Partial<SchoolDetail>) => {
      if (!schoolId) return;
      const res = await fetch(`/api/schools/${schoolId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error((json as { detail?: string }).detail ?? "Save failed.");
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schools", "detail", schoolId] });
      qc.invalidateQueries({ queryKey: ["schools", "list"] });
    },
    onError: (e: Error) => snackbar.show(e.message, "error"),
  });

  const remove = useMutation({
    mutationFn: async () => {
      if (!schoolId) return;
      const res = await fetch(`/api/schools/${schoolId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error((json as { detail?: string }).detail ?? "Delete failed.");
      }
    },
    onSuccess: () => {
      snackbar.show(`${data?.name ?? "School"} removed`);
      qc.invalidateQueries({ queryKey: ["schools", "list"] });
      setConfirmDelete(false);
      onClose();
    },
    onError: (e: Error) => snackbar.show(e.message, "error"),
  });

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={() => !patch.isPending && !remove.isPending && onClose()}
      PaperProps={{ sx: { width: { xs: "100%", sm: 560 } } }}
    >
      <Toolbar />
      <Box sx={{ p: 3, flex: 1, display: "flex", flexDirection: "column", overflow: "auto" }}>
        {isPending ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
            <CircularProgress size={28} />
          </Box>
        ) : error ? (
          <Alert severity="error">{error.message}</Alert>
        ) : data ? (
          <Stack spacing={3}>
            <Stack direction="row" alignItems="center" spacing={1}>
              <Box sx={{ flex: 1 }}>
                <Typography variant="overline" color="text.secondary">
                  School
                </Typography>
                <Typography variant="h6" sx={{ fontWeight: 600, lineHeight: 1.2 }}>
                  {data.name}
                </Typography>
              </Box>
              <IconButton onClick={onClose} size="small" aria-label="Close drawer">
                <CloseIcon />
              </IconButton>
            </Stack>

            <Stack spacing={1.5}>
              <DebouncedField
                label="Name"
                required
                value={data.name}
                onCommit={(v) => v.trim() && patch.mutate({ name: v.trim() })}
              />
              <DebouncedField
                label="Location"
                value={data.location ?? ""}
                placeholder="City, ST"
                onCommit={(v) => patch.mutate({ location: v.trim() || null })}
              />
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                <Box sx={{ flex: 1 }}>
                  <DebouncedField
                    label="Type"
                    value={data.school_type ?? ""}
                    placeholder="Public / Private / Charter / etc."
                    onCommit={(v) => patch.mutate({ school_type: v.trim() || null })}
                  />
                </Box>
                <Box sx={{ width: { xs: "100%", sm: 110 } }}>
                  <DebouncedField
                    label="Low grade"
                    value={data.grade_range_low ?? ""}
                    placeholder="K"
                    onCommit={(v) => patch.mutate({ grade_range_low: v.trim() || null })}
                  />
                </Box>
                <Box sx={{ width: { xs: "100%", sm: 110 } }}>
                  <DebouncedField
                    label="High grade"
                    value={data.grade_range_high ?? ""}
                    placeholder="12"
                    onCommit={(v) => patch.mutate({ grade_range_high: v.trim() || null })}
                  />
                </Box>
              </Stack>
              <DebouncedField
                label="Website"
                value={data.website ?? ""}
                placeholder="https://…"
                onCommit={(v) => patch.mutate({ website: v.trim() || null })}
              />
              <DebouncedField
                label="Fit profile"
                value={data.fit_profile ?? ""}
                placeholder="Who fits here — academics, social/emotional, supports, etc."
                multiline
                minRows={3}
                onCommit={(v) => patch.mutate({ fit_profile: v.trim() || null })}
              />
              <DebouncedField
                label="Notes"
                value={data.notes ?? ""}
                placeholder="Operational notes, contact preferences, etc."
                multiline
                minRows={3}
                onCommit={(v) => patch.mutate({ notes: v.trim() || null })}
              />
            </Stack>

            <Divider />

            <SubList
              title="Staff / contacts"
              count={data.staff.length}
              empty="No school workers on file yet — add them from Contacts."
            >
              {data.staff.map((s) => (
                <Box key={s.id} sx={{ py: 0.75 }}>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    {s.name}
                  </Typography>
                  <Stack direction="row" spacing={1.5} sx={{ color: "text.secondary", fontSize: 13 }}>
                    {s.role && <Box component="span">{s.role}</Box>}
                    {s.email && <Box component="span">{s.email}</Box>}
                    {s.phone && <Box component="span">{s.phone}</Box>}
                  </Stack>
                </Box>
              ))}
            </SubList>

            <SubList
              title="Visits"
              count={data.visits.length}
              empty="No campus visits logged for this school."
            >
              {data.visits.map((v) => (
                <Box key={v.id} sx={{ py: 0.75 }}>
                  <Typography variant="body2">
                    {v.visit_date ?? "Date —"} · {v.household_name}
                  </Typography>
                </Box>
              ))}
            </SubList>

            <SubList
              title="Recommendations"
              count={data.recommendations.length}
              empty="No families have this school on a recommendations list."
            >
              {data.recommendations.map((r) => (
                <Stack
                  key={r.id}
                  direction="row"
                  alignItems="baseline"
                  spacing={1}
                  sx={{ py: 0.75 }}
                >
                  <Typography variant="body2" sx={{ flex: 1 }}>
                    {r.household_name}
                  </Typography>
                  {r.rank && <Chip size="small" label={`Rank ${r.rank}`} variant="outlined" />}
                  {r.status && <Chip size="small" label={r.status} variant="outlined" />}
                </Stack>
              ))}
            </SubList>

            <Divider />

            <Box>
              <Typography variant="overline" color="error.main" sx={{ display: "block", mb: 1 }}>
                Danger zone
              </Typography>
              <Button
                color="error"
                variant="outlined"
                startIcon={<DeleteOutlineIcon />}
                onClick={() => setConfirmDelete(true)}
                disabled={remove.isPending}
              >
                Remove school
              </Button>
              {data.website && (
                <Box sx={{ mt: 1.5 }}>
                  <MuiLink
                    href={data.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    variant="caption"
                    sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, color: "text.disabled" }}
                  >
                    Visit website <OpenInNewIcon fontSize="inherit" />
                  </MuiLink>
                </Box>
              )}
            </Box>
          </Stack>
        ) : null}
      </Box>

      <Dialog open={confirmDelete} onClose={() => setConfirmDelete(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Remove {data?.name ?? "school"}?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Soft-deletes the school. Visits and recommendations that reference
            it keep their pointer but the school disappears from listings.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDelete(false)} disabled={remove.isPending}>
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => remove.mutate()}
            disabled={remove.isPending}
          >
            {remove.isPending ? "Removing…" : "Remove"}
          </Button>
        </DialogActions>
      </Dialog>
    </Drawer>
  );
}

function DebouncedField({
  label,
  value,
  required,
  placeholder,
  multiline,
  minRows,
  onCommit,
}: {
  label: string;
  value: string;
  required?: boolean;
  placeholder?: string;
  multiline?: boolean;
  minRows?: number;
  onCommit: (next: string) => void;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  return (
    <LabeledField label={label} required={required}>
      <TextField
        size="small"
        fullWidth
        sx={ghostFieldSx}
        placeholder={placeholder}
        multiline={multiline}
        minRows={minRows}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => {
          if (local !== value) onCommit(local);
        }}
      />
    </LabeledField>
  );
}

function SubList({
  title,
  count,
  empty,
  children,
}: {
  title: string;
  count: number;
  empty: string;
  children: React.ReactNode;
}) {
  return (
    <Box>
      <Stack direction="row" alignItems="baseline" spacing={1} sx={{ mb: 0.5 }}>
        <Typography variant="overline" color="text.secondary">
          {title}
        </Typography>
        <Typography variant="caption" color="text.disabled">
          ({count})
        </Typography>
      </Stack>
      {count === 0 ? (
        <Typography variant="body2" color="text.disabled" sx={{ fontStyle: "italic" }}>
          {empty}
        </Typography>
      ) : (
        <Stack divider={<Divider flexItem />}>{children}</Stack>
      )}
    </Box>
  );
}
