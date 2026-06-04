import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  FormControlLabel,
  IconButton,
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
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import PersonOffIcon from "@mui/icons-material/PersonOff";
import HowToRegIcon from "@mui/icons-material/HowToReg";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../../api/client";
import type { components } from "../../api/schema";
import { useAuth } from "../../auth";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { DataTableContainer } from "../../components/DataTableContainer";
import { FormDialog } from "../../components/FormDialog";
import { LabeledField } from "../../components/LabeledField";
import { StatusChip } from "../../components/StatusChip";

dayjs.extend(relativeTime);

type AdminUser = components["schemas"]["AdminUser"];
type CreateUserRequest = components["schemas"]["CreateUserRequest"];

const ROLE_OPTIONS: Array<CreateUserRequest["role"]> = [
  "consultant",
  "assistant",
  "admin",
];

// admin is the only role with actual permissions today; surface it
// distinctly so the eye finds owners at a glance.
const ROLE_TONE: Record<string, "info" | "neutral"> = {
  admin: "info",
  consultant: "neutral",
  assistant: "neutral",
};

export function AdminUsers() {
  const { user: me } = useAuth();
  const qc = useQueryClient();
  const [showInactive, setShowInactive] = useState(false);

  const { data, isPending, error } = useQuery<AdminUser[], Error>({
    queryKey: ["admin", "users", showInactive],
    queryFn: async () => {
      const { data, error: respError } = await api.GET("/api/admin/users", {
        params: { query: { include_inactive: showInactive } },
      });
      if (respError || !data) throw new Error("users fetch failed");
      return data;
    },
  });

  const [addOpen, setAddOpen] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState<AdminUser | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin", "users"] });

  const deactivate = useMutation({
    mutationFn: async (id: string) => {
      const { error: respError } = await api.DELETE("/api/admin/users/{user_id}", {
        params: { path: { user_id: id } },
      });
      if (respError) {
        const msg =
          (respError as { detail?: string }).detail ?? "Failed to deactivate.";
        throw new Error(msg);
      }
    },
    onSuccess: () => {
      setConfirmDeactivate(null);
      invalidate();
    },
  });

  const reactivate = useMutation({
    mutationFn: async (id: string) => {
      const { error: respError } = await api.POST(
        "/api/admin/users/{user_id}/reactivate",
        { params: { path: { user_id: id } } },
      );
      if (respError) {
        const msg =
          (respError as { detail?: string }).detail ?? "Failed to reactivate.";
        throw new Error(msg);
      }
    },
    onSuccess: invalidate,
  });

  if (error) {
    return <Alert severity="error">Failed to load users: {error.message}</Alert>;
  }

  // Admin-only actions (Add / Deactivate / Reactivate) are hidden for
  // non-admins. Backend gates the underlying endpoints too — this just
  // declutters the page for the consultant/assistant audience.
  const isAdmin = me?.role === "admin";

  return (
    <Stack spacing={2}>
      <Stack direction="row" alignItems="center" spacing={2}>
        <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
          Everyone with a session in the cluster. Listed sorted by active-status,
          then name.{isAdmin && " Adding a user pre-authorizes that email; they can sign in via Google as soon as the row exists."}
        </Typography>
        {isAdmin && (
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
              />
            }
            label={<Typography variant="body2">Show inactive</Typography>}
          />
        )}
        {isAdmin && (
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setAddOpen(true)}
          >
            Add user
          </Button>
        )}
      </Stack>

      {(deactivate.error || reactivate.error) && (
        <Alert severity="error" onClose={() => { deactivate.reset(); reactivate.reset(); }}>
          {(deactivate.error ?? reactivate.error)?.message}
        </Alert>
      )}

      <DataTableContainer
        loading={isPending}
        loadingColumns={isAdmin ? 7 : 6}
        loadingRows={3}
        empty={!isPending && (data?.length ?? 0) === 0}
        emptyTitle="No users yet"
      >
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Email</TableCell>
              <TableCell>Role</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Last login</TableCell>
              <TableCell>Joined</TableCell>
              {isAdmin && <TableCell align="right">Actions</TableCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {data?.map((u) => {
                const isMe = me?.id === u.id;
                return (
                  <TableRow key={u.id} hover>
                    <TableCell>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <span>{u.name}</span>
                        {isMe && (
                          <StatusChip
                            size="small"
                            label="you"
                            tone="neutral"
                            variant="soft"
                            sx={{ height: 18, fontSize: 10, "& .MuiChip-label": { px: 0.75 } }}
                          />
                        )}
                      </Stack>
                    </TableCell>
                    <TableCell>{u.email}</TableCell>
                    <TableCell>
                      <StatusChip
                        size="small"
                        label={u.role}
                        tone={ROLE_TONE[u.role] ?? "neutral"}
                        variant="soft"
                      />
                    </TableCell>
                    <TableCell>
                      <StatusChip
                        size="small"
                        label={u.is_active ? "active" : "inactive"}
                        tone={u.is_active ? "success" : "neutral"}
                        variant="soft"
                      />
                    </TableCell>
                    <TableCell>
                      {u.last_login_at ? (
                        <Tooltip title={dayjs(u.last_login_at).format()}>
                          <span>{dayjs(u.last_login_at).fromNow()}</span>
                        </Tooltip>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>{dayjs(u.created_at).format("MMM D, YYYY")}</TableCell>
                    {isAdmin && (
                      <TableCell align="right">
                        {u.is_active ? (
                          <Tooltip title={isMe ? "You can't deactivate yourself" : "Deactivate"}>
                            <span>
                              <IconButton
                                size="small"
                                disabled={isMe}
                                onClick={() => setConfirmDeactivate(u)}
                              >
                                <PersonOffIcon fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                        ) : (
                          <Tooltip title="Reactivate">
                            <IconButton
                              size="small"
                              onClick={() => reactivate.mutate(u.id)}
                              disabled={reactivate.isPending}
                            >
                              <HowToRegIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
          </TableBody>
        </Table>
      </DataTableContainer>

      <AddUserDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={invalidate}
      />

      <ConfirmDialog
        open={!!confirmDeactivate}
        title={`Deactivate ${confirmDeactivate?.name ?? "user"}?`}
        description="They'll lose access immediately. Their audit-log entries stay so the history is preserved, and you can reactivate them later."
        confirmLabel="Deactivate"
        confirmColor="error"
        pending={deactivate.isPending}
        onClose={() => setConfirmDeactivate(null)}
        onConfirm={() => confirmDeactivate && deactivate.mutate(confirmDeactivate.id)}
      />
    </Stack>
  );
}

function AddUserDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<CreateUserRequest["role"]>("consultant");

  const create = useMutation({
    mutationFn: async (body: CreateUserRequest) => {
      const { data, error: respError } = await api.POST("/api/admin/users", {
        body,
      });
      if (respError || !data) {
        const msg =
          (respError as { detail?: string } | undefined)?.detail ??
          "Failed to create user.";
        throw new Error(msg);
      }
      return data;
    },
    onSuccess: () => {
      onCreated();
      reset();
      onClose();
    },
  });

  const reset = () => {
    setEmail("");
    setName("");
    setRole("consultant");
    create.reset();
  };

  const handleClose = () => {
    if (create.isPending) return;
    reset();
    onClose();
  };

  return (
      <FormDialog
        open={open}
        onClose={handleClose}
        title="Add user"
        subtitle="Pre-authorize an email address for Google sign-in."
        maxWidth="xs"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate({ email: email.trim(), name: name.trim(), role });
        }}
        actions={
          <>
            <Button onClick={handleClose} disabled={create.isPending}>Cancel</Button>
            <Button
              type="submit"
              variant="contained"
              disabled={create.isPending || !email.trim() || !name.trim()}
            >
              {create.isPending ? "Adding..." : "Add"}
            </Button>
          </>
        }
      >
          <Stack spacing={2} sx={{ mt: 1 }}>
            <LabeledField label="Email" required>
              <TextField
                autoFocus
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                fullWidth
                inputProps={{ maxLength: 320 }}
              />
            </LabeledField>
            <LabeledField label="Name" required>
              <TextField
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                fullWidth
                inputProps={{ maxLength: 200 }}
              />
            </LabeledField>
            <LabeledField label="Role" required info={<RoleInfoTooltip />}>
              <TextField
                required
                select
                value={role}
                onChange={(e) => setRole(e.target.value as CreateUserRequest["role"])}
                fullWidth
              >
                {ROLE_OPTIONS.map((r) => (
                  <MenuItem key={r} value={r}>{r}</MenuItem>
                ))}
              </TextField>
            </LabeledField>
            {create.error && (
              <Alert severity="error">{create.error.message}</Alert>
            )}
          </Stack>
      </FormDialog>
  );
}

// Tooltip body describing what each role does. Today the backend
// doesn't gate any endpoints on role — every authenticated user can
// hit every route — so these labels describe intent rather than
// hard-enforced permissions. If/when permission gating arrives the
// tooltip text wants updating alongside it.
function RoleInfoTooltip() {
  return (
    <Stack spacing={1} sx={{ p: 0.5, maxWidth: 280 }}>
      <Box>
        <Typography variant="caption" sx={{ fontWeight: 600 }}>
          Admin
        </Typography>
        <Typography variant="caption" component="div">
          Manages other users (add / deactivate / reactivate) and the system
          settings. Intended for the owner-operator.
        </Typography>
      </Box>
      <Box>
        <Typography variant="caption" sx={{ fontWeight: 600 }}>
          Consultant
        </Typography>
        <Typography variant="caption" component="div">
          Standard role for staff doing the day-to-day consulting work —
          families, students, engagements, notes, invoices.
        </Typography>
      </Box>
      <Box>
        <Typography variant="caption" sx={{ fontWeight: 600 }}>
          Assistant
        </Typography>
        <Typography variant="caption" component="div">
          Junior / support role. Reserved for narrower permissions in the
          future; same access as Consultant today.
        </Typography>
      </Box>
    </Stack>
  );
}
