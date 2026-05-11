import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link as RouterLink } from "react-router-dom";

import { api } from "../../api/client";
import type { components } from "../../api/schema";
import { LabeledField } from "../../components/LabeledField";
import { useSnackbar } from "../../components/Snackbar";
import { StatusChip } from "../../components/StatusChip";

type PersonDetail = components["schemas"]["PersonDetail"];

const KIND_LABEL: Record<string, string> = {
  guardian: "Guardian",
  student: "Student",
  school_worker: "School worker",
  other: "Other",
};

/**
 * Right-side detail panel for a contact. Editable in place: each
 * field PATCHes on blur (the student page's pattern). A danger-zone
 * Remove button at the footer soft-deletes via DELETE /api/people/{id}.
 *
 * Family memberships are display-only — adding/removing a family link
 * happens via the family detail page's Add parent / Add student flows.
 */
export function ContactDrawer({
  personId,
  onClose,
}: {
  personId: string | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const snackbar = useSnackbar();
  const { data, isPending, error } = useQuery<PersonDetail, Error>({
    queryKey: ["contacts", "detail", personId],
    enabled: !!personId,
    queryFn: async () => {
      const { data, error: respError } = await api.GET("/api/people/{person_id}", {
        params: { path: { person_id: personId! } },
      });
      if (respError || !data) throw new Error("Failed to load contact.");
      return data;
    },
  });

  const patch = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      if (!personId) throw new Error("no contact");
      const { error: respError } = await api.PATCH("/api/people/{person_id}", {
        params: { path: { person_id: personId } },
        body: body as never,
      });
      if (respError) {
        const msg = (respError as { detail?: string }).detail ?? "Save failed.";
        throw new Error(msg);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contacts", "detail", personId] });
      qc.invalidateQueries({ queryKey: ["contacts", "list"] });
    },
    onError: (e: Error) => snackbar.show(e.message, "error"),
  });

  const remove = useMutation({
    mutationFn: async () => {
      if (!personId) throw new Error("no contact");
      const { error: respError } = await api.DELETE("/api/people/{person_id}", {
        params: { path: { person_id: personId } },
      });
      if (respError) {
        const msg = (respError as { detail?: string }).detail ?? "Delete failed.";
        throw new Error(msg);
      }
    },
    onSuccess: () => {
      snackbar.show(`${data ? [data.first_name, data.last_name].filter(Boolean).join(" ") : "Contact"} removed`);
      qc.invalidateQueries({ queryKey: ["contacts", "list"] });
      onClose();
    },
    onError: (e: Error) => snackbar.show(e.message, "error"),
  });

  return (
    <Drawer
      anchor="right"
      open={!!personId}
      onClose={() => !patch.isPending && !remove.isPending && onClose()}
      PaperProps={{ sx: { width: { xs: "100%", sm: 500 } } }}
    >
      <Toolbar />
      <Box sx={{ p: 3, flex: 1, display: "flex", flexDirection: "column", overflow: "auto" }}>
        <Stack direction="row" alignItems="center" sx={{ mb: 2 }}>
          <Typography variant="overline" color="text.secondary" sx={{ flex: 1 }}>
            Contact
          </Typography>
          <IconButton size="small" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </IconButton>
        </Stack>

        {error && <Alert severity="error">{error.message}</Alert>}
        {isPending ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
            <CircularProgress size={28} />
          </Box>
        ) : data ? (
          <Stack spacing={3}>
            <HeaderBlock person={data} />
            <EditableContactInfo person={data} onPatch={patch.mutate} />
            <FamilySection person={data} />
            {data.school_name && <SchoolSection person={data} />}
            <DangerZone
              displayName={[data.first_name, data.last_name].filter(Boolean).join(" ")}
              onConfirm={remove.mutate}
              pending={remove.isPending}
            />
          </Stack>
        ) : null}
      </Box>
    </Drawer>
  );
}

function HeaderBlock({ person }: { person: PersonDetail }) {
  const fullName = [person.first_name, person.last_name].filter(Boolean).join(" ");
  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 600 }}>
        {fullName}
      </Typography>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}>
        <StatusChip
          size="small"
          label={KIND_LABEL[person.kind] ?? person.kind}
          tone="info"
          variant="outlined"
        />
        {person.current_grade && (
          <Typography variant="caption" color="text.secondary">
            Grade {person.current_grade}
          </Typography>
        )}
      </Stack>
    </Box>
  );
}

function EditableContactInfo({
  person,
  onPatch,
}: {
  person: PersonDetail;
  onPatch: (body: Record<string, unknown>) => void;
}) {
  return (
    <Section title="Contact">
      <Stack spacing={2}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <DebouncedField
            label="First name"
            required
            initial={person.first_name}
            onCommit={(v) => v.trim() && onPatch({ first_name: v.trim() })}
          />
          <DebouncedField
            label="Last name"
            required
            initial={person.last_name ?? ""}
            onCommit={(v) => v.trim() && onPatch({ last_name: v.trim() })}
          />
        </Stack>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <DebouncedField
            label="Email"
            type="email"
            initial={person.email ?? ""}
            onCommit={(v) => onPatch({ email: v.trim() || null })}
            invalidPattern={/^[^\s@]+@[^\s@]+\.[^\s@]+$/}
            invalidHelper="Invalid email."
          />
          <DebouncedField
            label="Phone"
            initial={person.phone ?? ""}
            onCommit={(v) => onPatch({ phone: v.trim() || null })}
          />
        </Stack>
        <AddressBlock person={person} onPatch={onPatch} />
      </Stack>
    </Section>
  );
}

function AddressBlock({
  person,
  onPatch,
}: {
  person: PersonDetail;
  onPatch: (body: Record<string, unknown>) => void;
}) {
  // The detail response composes mailing_address as a multi-line string
  // for display, but for editing we want the structured columns. They
  // aren't on PersonDetail today — fall back to splitting the composed
  // blob heuristically. The save path writes the new structured value
  // and the next refetch supplies the composed echo.
  const composed = person.mailing_address ?? "";
  // Try a best-effort split: first line is street1; second line might be
  // the city/state/zip combo. We don't try to be clever — the operator
  // can just retype in the right fields.
  const lines = composed.split("\n");
  const initialStreet1 = lines[0] ?? "";
  const initialCityStateZip = lines.slice(1).join(" ");

  const [street1, setStreet1] = useState(initialStreet1);
  const [cityStateZip, setCityStateZip] = useState(initialCityStateZip);

  // Sync when the upstream data changes (refetch after another field's
  // save) so the operator's edits don't get clobbered mid-stream.
  useEffect(() => {
    setStreet1(initialStreet1);
    setCityStateZip(initialCityStateZip);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [person.mailing_address]);

  return (
    <Stack spacing={1.5}>
      <DebouncedField
        label="Street"
        initial={street1}
        onCommit={(v) => {
          setStreet1(v);
          onPatch({ street1: v.trim() || null });
        }}
      />
      <DebouncedField
        label="City / state / ZIP"
        initial={cityStateZip}
        onCommit={(v) => {
          // Parse "City, ST 62701" → set city, state, postal_code.
          // Falls back to dropping all three to NULL on blank.
          setCityStateZip(v);
          const trimmed = v.trim();
          if (!trimmed) {
            onPatch({ city: null, state: null, postal_code: null });
            return;
          }
          const m = trimmed.match(/^(.+?)[,\s]+([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/);
          if (m) {
            onPatch({ city: m[1].trim(), state: m[2], postal_code: m[3] });
          } else {
            // Fallback: dump everything into city; backend will accept
            // the change but the operator can re-edit.
            onPatch({ city: trimmed, state: null, postal_code: null });
          }
        }}
        helperText='Format: "City, ST 62701" — fields split on save.'
      />
    </Stack>
  );
}

function FamilySection({ person }: { person: PersonDetail }) {
  // Defensive: the live API may still be serving the pre-PR-#54
  // response shape while ArgoCD rolls out the new image. Default to
  // an empty list so the drawer renders the "not mapped" state rather
  // than crashing on undefined.
  const memberships = person.memberships ?? [];
  if (memberships.length === 0) {
    return (
      <Section title="Family">
        <Typography variant="body2" color="text.disabled">
          Not mapped to a family yet.
        </Typography>
      </Section>
    );
  }
  return (
    <Section title={memberships.length === 1 ? "Family" : "Families"}>
      <Stack spacing={1}>
        {memberships.map((m) => {
          const roleLabel = m.role.startsWith("guardian:")
            ? m.role.slice("guardian:".length)
            : m.role;
          return (
            <Stack
              key={m.family_id}
              direction="row"
              spacing={1}
              alignItems="center"
            >
              {m.is_archived ? (
                <Typography variant="body2" sx={{ color: "text.disabled" }}>
                  {m.household_name}
                </Typography>
              ) : (
                <MuiLink
                  component={RouterLink}
                  to={`/families/${m.family_id}`}
                  underline="hover"
                  variant="body2"
                >
                  {m.household_name}
                </MuiLink>
              )}
              <Typography variant="caption" color="text.secondary">
                · {roleLabel}
              </Typography>
              {m.is_archived && (
                <StatusChip
                  size="small"
                  label="archived"
                  tone="warning"
                  variant="outlined"
                />
              )}
            </Stack>
          );
        })}
      </Stack>
    </Section>
  );
}

function SchoolSection({ person }: { person: PersonDetail }) {
  return (
    <Section title="School">
      <Typography variant="body2">{person.school_name}</Typography>
    </Section>
  );
}

function DangerZone({
  displayName,
  onConfirm,
  pending,
}: {
  displayName: string;
  onConfirm: () => void;
  pending: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  return (
    <Box>
      <Typography variant="overline" color="error.main" sx={{ display: "block", mb: 1 }}>
        Danger zone
      </Typography>
      <Divider sx={{ mb: 1.5 }} />
      {!confirming ? (
        <Button
          color="error"
          variant="outlined"
          startIcon={<DeleteOutlineIcon />}
          onClick={() => setConfirming(true)}
        >
          Remove contact
        </Button>
      ) : (
        <Stack spacing={1}>
          <Typography variant="body2" color="text.secondary">
            Soft-delete {displayName}? They'll disappear from contacts and family
            rosters; their data stays in the DB.
          </Typography>
          <Stack direction="row" spacing={1}>
            <Button
              color="error"
              variant="contained"
              onClick={onConfirm}
              disabled={pending}
            >
              Confirm remove
            </Button>
            <Button onClick={() => setConfirming(false)}>Cancel</Button>
          </Stack>
        </Stack>
      )}
    </Box>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box>
      <Typography variant="overline" color="text.secondary" sx={{ display: "block", mb: 1 }}>
        {title}
      </Typography>
      <Divider sx={{ mb: 1.5 }} />
      {children}
    </Box>
  );
}

/** Text input that holds local state until blur, then commits via
 *  onCommit. Optional pattern validates inline. */
function DebouncedField({
  label,
  initial,
  type,
  required,
  invalidPattern,
  invalidHelper,
  helperText,
  onCommit,
}: {
  label: string;
  initial: string;
  type?: string;
  required?: boolean;
  invalidPattern?: RegExp;
  invalidHelper?: string;
  helperText?: string;
  onCommit: (v: string) => void;
}) {
  const [value, setValue] = useState(initial);
  useEffect(() => {
    setValue(initial);
  }, [initial]);
  const trimmed = value.trim();
  const formatInvalid =
    !!invalidPattern && !!trimmed && !invalidPattern.test(trimmed);
  return (
    <LabeledField label={label} required={required}>
      <TextField
        type={type}
        required={required}
        fullWidth
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => {
          if (value === initial) return;
          if (formatInvalid) return;
          onCommit(value);
        }}
        error={formatInvalid}
        helperText={formatInvalid ? invalidHelper : helperText}
      />
    </LabeledField>
  );
}
