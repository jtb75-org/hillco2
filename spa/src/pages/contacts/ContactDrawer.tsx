import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Drawer,
  FormControlLabel,
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
import { DrawerSection } from "../../components/DrawerSection";
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
      // A contact can be a guardian or a student on a family — name /
      // email / phone edits should refresh the family roster cards.
      qc.invalidateQueries({ queryKey: ["families"] });
      // Student detail queries are keyed on the student's person_id.
      qc.invalidateQueries({ queryKey: ["students"] });
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
      // Deleting a guardian / student from /contacts removes them from
      // their family page too; force the family roster to refetch.
      qc.invalidateQueries({ queryKey: ["families"] });
      qc.invalidateQueries({ queryKey: ["students"] });
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
          variant="soft"
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
        <StructuredAddressBlock
          street1={person.street1 ?? ""}
          street2={person.street2 ?? ""}
          city={person.city ?? ""}
          state={person.state ?? ""}
          postalCode={person.postal_code ?? ""}
          onPatch={onPatch}
          fieldPrefix=""
        />
        <BillingBlock person={person} onPatch={onPatch} />
      </Stack>
    </Section>
  );
}

/**
 * Renders the four structured-address inputs (street, apt, city, state,
 * ZIP). Used for both mailing and billing; the `fieldPrefix` decides
 * which underlying column each input writes to.
 */
function StructuredAddressBlock({
  street1,
  street2,
  city,
  state,
  postalCode,
  onPatch,
  fieldPrefix,
}: {
  street1: string;
  street2: string;
  city: string;
  state: string;
  postalCode: string;
  onPatch: (body: Record<string, unknown>) => void;
  /** "" for mailing, "billing_" for the override. */
  fieldPrefix: "" | "billing_";
}) {
  const k = (suffix: string) => `${fieldPrefix}${suffix}`;
  return (
    <Stack spacing={1.5}>
      <DebouncedField
        label="Street address"
        initial={street1}
        onCommit={(v) => onPatch({ [k("street1")]: v.trim() || null })}
      />
      <DebouncedField
        label="Apt / suite / unit"
        initial={street2}
        onCommit={(v) => onPatch({ [k("street2")]: v.trim() || null })}
      />
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
        <Box sx={{ flex: 2 }}>
          <DebouncedField
            label="City"
            initial={city}
            onCommit={(v) => onPatch({ [k("city")]: v.trim() || null })}
          />
        </Box>
        <Box sx={{ flex: 1 }}>
          <DebouncedField
            label="State"
            initial={state}
            onCommit={(v) => onPatch({ [k("state")]: v.trim() || null })}
          />
        </Box>
        <Box sx={{ flex: 1 }}>
          <DebouncedField
            label="ZIP / postal"
            initial={postalCode}
            onCommit={(v) => onPatch({ [k("postal_code")]: v.trim() || null })}
            invalidPattern={/^\d{5}(-\d{4})?$/}
            invalidHelper="Use 5 digits or ZIP+4."
          />
        </Box>
      </Stack>
    </Stack>
  );
}

/**
 * "Use a different billing address" checkbox + the structured billing
 * override fields. Default state derives from whether any billing
 * column has a value. Unchecking clears every billing column in one
 * PATCH so invoices fall back to the mailing address.
 */
function BillingBlock({
  person,
  onPatch,
}: {
  person: PersonDetail;
  onPatch: (body: Record<string, unknown>) => void;
}) {
  const hasBillingOverride =
    !!person.billing_street1 ||
    !!person.billing_street2 ||
    !!person.billing_city ||
    !!person.billing_state ||
    !!person.billing_postal_code ||
    !!person.billing_country ||
    !!person.billing_attention_to;

  const [enabled, setEnabled] = useState(hasBillingOverride);

  // Sync if upstream changes (another field's PATCH refetches and
  // updates `hasBillingOverride`). Don't fight the operator if they
  // just toggled it locally.
  useEffect(() => {
    if (hasBillingOverride && !enabled) setEnabled(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasBillingOverride]);

  const handleToggle = (checked: boolean) => {
    setEnabled(checked);
    if (!checked) {
      onPatch({
        billing_street1: null,
        billing_street2: null,
        billing_city: null,
        billing_state: null,
        billing_postal_code: null,
        billing_country: null,
        billing_attention_to: null,
      });
    }
  };

  return (
    <Box>
      <FormControlLabel
        control={
          <Checkbox
            checked={enabled}
            onChange={(e) => handleToggle(e.target.checked)}
          />
        }
        label={
          <Typography variant="body2">
            Use a different billing address
          </Typography>
        }
      />
      {enabled && (
        <Stack spacing={1.5} sx={{ mt: 1, ml: 4 }}>
          <DebouncedField
            label="Attention to"
            initial={person.billing_attention_to ?? ""}
            onCommit={(v) =>
              onPatch({ billing_attention_to: v.trim() || null })
            }
          />
          <StructuredAddressBlock
            street1={person.billing_street1 ?? ""}
            street2={person.billing_street2 ?? ""}
            city={person.billing_city ?? ""}
            state={person.billing_state ?? ""}
            postalCode={person.billing_postal_code ?? ""}
            onPatch={onPatch}
            fieldPrefix="billing_"
          />
        </Stack>
      )}
    </Box>
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
                  variant="soft"
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
    <DrawerSection title="Danger zone" tone="danger">
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
    </DrawerSection>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <DrawerSection title={title}>{children}</DrawerSection>;
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
