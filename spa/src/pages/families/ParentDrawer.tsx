import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Divider,
  Drawer,
  FormControlLabel,
  IconButton,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Toolbar,
  Tooltip,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { useMutation, useQuery } from "@tanstack/react-query";

import { api } from "../../api/client";
import type { components } from "../../api/schema";
import { LabeledField } from "../../components/LabeledField";

type ParentUpdate = components["schemas"]["ParentUpdate"];
type PersonDetail = components["schemas"]["PersonDetail"];
type Role = NonNullable<ParentUpdate["role"]>;

const ROLE_OPTIONS: Role[] = ["mom", "dad", "guardian", "other"];

export interface ParentDrawerTarget {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string;
  is_primary_contact: boolean;
  is_billing_contact: boolean;
  mailing_address: string | null;
  billing_address: string | null;
}

/**
 * Slide-in detail panel for a parent: name + flag toggles at the top,
 * editable fields below, danger-zone remove at the bottom. Replaces
 * the previous kebab-menu-per-card pattern.
 */
export function ParentDrawer({
  open,
  parent,
  onClose,
  onChanged,
  onRemoved,
}: {
  open: boolean;
  parent: ParentDrawerTarget | null;
  onClose: () => void;
  onChanged: () => void;
  onRemoved: () => void;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [street1, setStreet1] = useState("");
  const [street2, setStreet2] = useState("");
  const [city, setCity] = useState("");
  const [stateCode, setStateCode] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [role, setRole] = useState<Role>("other");
  const [useBillingOverride, setUseBillingOverride] = useState(false);
  const [billingAttn, setBillingAttn] = useState("");
  const [billingStreet1, setBillingStreet1] = useState("");
  const [billingStreet2, setBillingStreet2] = useState("");
  const [billingCity, setBillingCity] = useState("");
  const [billingState, setBillingState] = useState("");
  const [billingPostalCode, setBillingPostalCode] = useState("");
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  // Fetch the structured mailing + billing columns for pre-fill.
  // ParentDrawerTarget only has the composed blobs (mailing_address,
  // billing_address) which can't drive individual inputs, so we pull
  // the structured columns from /api/people/{id} on open.
  const person = useQuery<PersonDetail, Error>({
    queryKey: ["contacts", "detail", parent?.id],
    enabled: !!parent?.id,
    queryFn: async () => {
      const { data, error } = await api.GET("/api/people/{person_id}", {
        params: { path: { person_id: parent!.id } },
      });
      if (error || !data) throw new Error("Failed to load person.");
      return data;
    },
  });

  // Hydrate form when the drawer opens on a new parent OR when the
  // structured data lands. Track the id+data fingerprint so editing
  // a field doesn't immediately get clobbered by a refetch.
  const hydratedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!parent) return;
    const fingerprint = `${parent.id}:${person.data?.id ?? ""}`;
    if (hydratedFor.current === fingerprint) return;
    hydratedFor.current = fingerprint;

    const parts = (parent.name || "").split(/\s+/);
    setFirstName(parts[0] ?? "");
    setLastName(parts.slice(1).join(" "));
    setEmail(parent.email ?? "");
    setPhone(parent.phone ?? "");
    setRole((parent.role as Role) || "other");
    setConfirmingRemove(false);

    const p = person.data;
    setStreet1(p?.street1 ?? "");
    setStreet2(p?.street2 ?? "");
    setCity(p?.city ?? "");
    setStateCode(p?.state ?? "");
    setPostalCode(p?.postal_code ?? "");
    // Billing checkbox state derived from any billing column having
    // a value. Falls back to the composed flag on ParentDrawerTarget
    // until the fetch lands.
    const hasBillingOverride = p
      ? !!p.billing_street1 ||
        !!p.billing_street2 ||
        !!p.billing_city ||
        !!p.billing_state ||
        !!p.billing_postal_code ||
        !!p.billing_country ||
        !!p.billing_attention_to
      : !!parent.billing_address;
    setUseBillingOverride(hasBillingOverride);
    setBillingAttn(p?.billing_attention_to ?? "");
    setBillingStreet1(p?.billing_street1 ?? "");
    setBillingStreet2(p?.billing_street2 ?? "");
    setBillingCity(p?.billing_city ?? "");
    setBillingState(p?.billing_state ?? "");
    setBillingPostalCode(p?.billing_postal_code ?? "");
  }, [parent, person.data]);

  const patch = useMutation({
    mutationFn: async (body: ParentUpdate) => {
      if (!parent) throw new Error("no parent");
      const { error: respError } = await api.PATCH(
        "/api/parents/{parent_id}",
        { params: { path: { parent_id: parent.id } }, body },
      );
      if (respError) {
        const msg = (respError as { detail?: string }).detail ?? "Failed.";
        throw new Error(msg);
      }
    },
    onSuccess: onChanged,
  });

  const remove = useMutation({
    mutationFn: async () => {
      if (!parent) throw new Error("no parent");
      const { error: respError } = await api.DELETE(
        "/api/parents/{parent_id}",
        { params: { path: { parent_id: parent.id } } },
      );
      if (respError) {
        const msg = (respError as { detail?: string }).detail ?? "Failed.";
        throw new Error(msg);
      }
    },
    onSuccess: () => {
      setConfirmingRemove(false);
      onRemoved();
      onClose();
    },
  });

  // Mirror the email + ZIP format checks from AddParentDialog.
  const emailTrimmed = email.trim();
  const zipTrimmed = postalCode.trim();
  const emailLooksValid = !emailTrimmed || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed);
  const zipLooksValid = !zipTrimmed || /^\d{5}(-\d{4})?$/.test(zipTrimmed);

  const canBeBilling = parent
    ? !!parent.email && (!!parent.mailing_address || !!parent.billing_address)
    : false;
  const isBilling = !!parent?.is_billing_contact;
  const isPrimary = !!parent?.is_primary_contact;

  const saveDisabled =
    patch.isPending ||
    !firstName.trim() ||
    !lastName.trim() ||
    !emailLooksValid ||
    !zipLooksValid ||
    (isBilling && !emailTrimmed);

  const handleSave = () => {
    // Form fields are pre-filled from /api/people/{id} now, so the
    // submitted values reflect the operator's intent regardless of
    // whether they edited anything. Blank → null for nullable columns.
    const body: ParentUpdate = {
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      email: email.trim() || null,
      phone: phone.trim() || null,
      role,
      street1: street1.trim() || null,
      street2: street2.trim() || null,
      city: city.trim() || null,
      state: stateCode.trim() || null,
      postal_code: postalCode.trim() || null,
    };
    if (useBillingOverride) {
      body.billing_attention_to = billingAttn.trim() || null;
      body.billing_street1 = billingStreet1.trim() || null;
      body.billing_street2 = billingStreet2.trim() || null;
      body.billing_city = billingCity.trim() || null;
      body.billing_state = billingState.trim() || null;
      body.billing_postal_code = billingPostalCode.trim() || null;
    } else {
      // Checkbox unchecked — null every billing column so invoices fall
      // back to the mailing address.
      body.billing_attention_to = null;
      body.billing_street1 = null;
      body.billing_street2 = null;
      body.billing_city = null;
      body.billing_state = null;
      body.billing_postal_code = null;
    }
    patch.mutate(body);
  };

  return (
    <Drawer
      anchor="right"
      open={open && !!parent}
      onClose={() => !patch.isPending && !remove.isPending && onClose()}
      PaperProps={{ sx: { width: { xs: "100%", sm: 460 } } }}
    >
      {/* Spacer matching the fixed AppBar — keeps the drawer content
          out from under the toolbar without bumping z-index. */}
      <Toolbar />
      <Box sx={{ p: 3, flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Header */}
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="overline" color="text.secondary">
              Parent / guardian
            </Typography>
            <Typography variant="h6" sx={{ fontWeight: 600, lineHeight: 1.2 }}>
              {parent?.name}
            </Typography>
          </Box>
          <IconButton onClick={onClose} size="small" aria-label="Close drawer">
            <CloseIcon />
          </IconButton>
        </Stack>

        {/* Flag toggles */}
        <Stack
          direction="row"
          spacing={2}
          sx={{ mt: 1, mb: 2, p: 1.5, bgcolor: "action.hover", borderRadius: 1 }}
        >
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={isPrimary}
                disabled={patch.isPending}
                onChange={(e) =>
                  patch.mutate({ is_primary_contact: e.target.checked })
                }
              />
            }
            label={<Typography variant="body2">Primary</Typography>}
          />
          <Tooltip
            title={
              !isBilling && !canBeBilling
                ? "Add an email and mailing address first."
                : ""
            }
            placement="bottom"
          >
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={isBilling}
                  disabled={patch.isPending || (!isBilling && !canBeBilling)}
                  onChange={(e) =>
                    patch.mutate({ is_billing_contact: e.target.checked })
                  }
                />
              }
              label={<Typography variant="body2">Billing</Typography>}
            />
          </Tooltip>
        </Stack>

        {/* Edit form */}
        <Box sx={{ flex: 1, overflowY: "auto", mx: -1, px: 1 }}>
          <Stack spacing={2}>
            <Stack direction="row" spacing={2}>
              <LabeledField label="First name" required>
                <TextField
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  fullWidth
                  inputProps={{ maxLength: 100 }}
                />
              </LabeledField>
              <LabeledField label="Last name" required>
                <TextField
                  required
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  fullWidth
                  inputProps={{ maxLength: 100 }}
                />
              </LabeledField>
            </Stack>
            <LabeledField label="Email" required={isBilling}>
              <TextField
                type="email"
                required={isBilling}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                fullWidth
                error={!emailLooksValid}
                helperText={!emailLooksValid ? "Invalid email." : undefined}
              />
            </LabeledField>
            <LabeledField label="Phone">
              <TextField
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                fullWidth
              />
            </LabeledField>
            <LabeledField
              label="Street address"
              helperText={
                parent?.mailing_address
                  ? "Filling these overwrites the current address. Leave blank to keep it."
                  : "Leave blank if you don't have an address yet."
              }
            >
              <TextField
                placeholder="123 Main St"
                value={street1}
                onChange={(e) => setStreet1(e.target.value)}
                fullWidth
                inputProps={{ maxLength: 200 }}
              />
            </LabeledField>
            <LabeledField label="Apt / suite / unit">
              <TextField
                placeholder="Apt 4B"
                value={street2}
                onChange={(e) => setStreet2(e.target.value)}
                fullWidth
                inputProps={{ maxLength: 100 }}
              />
            </LabeledField>
            <Stack direction="row" spacing={2}>
              <Box sx={{ flex: 2 }}>
                <LabeledField label="City">
                  <TextField
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    fullWidth
                    inputProps={{ maxLength: 100 }}
                  />
                </LabeledField>
              </Box>
              <Box sx={{ flex: 1 }}>
                <LabeledField label="State">
                  <TextField
                    placeholder="IL"
                    value={stateCode}
                    onChange={(e) => setStateCode(e.target.value)}
                    fullWidth
                    inputProps={{ maxLength: 50 }}
                  />
                </LabeledField>
              </Box>
              <Box sx={{ flex: 1 }}>
                <LabeledField label="ZIP / postal">
                  <TextField
                    placeholder="62701"
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value)}
                    fullWidth
                    inputProps={{ maxLength: 10 }}
                    error={!zipLooksValid}
                    helperText={!zipLooksValid ? "Use 5 digits or ZIP+4." : undefined}
                  />
                </LabeledField>
              </Box>
            </Stack>
            <Box>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={useBillingOverride}
                    onChange={(e) => setUseBillingOverride(e.target.checked)}
                  />
                }
                label={
                  <Typography variant="body2">
                    Use a different billing address
                  </Typography>
                }
              />
              {useBillingOverride && (
                <Stack spacing={1.5} sx={{ mt: 1, ml: 4 }}>
                  <LabeledField label="Attention to">
                    <TextField
                      placeholder='e.g. "Jane Doe, CPA"'
                      value={billingAttn}
                      onChange={(e) => setBillingAttn(e.target.value)}
                      fullWidth
                      inputProps={{ maxLength: 200 }}
                    />
                  </LabeledField>
                  <LabeledField label="Street address">
                    <TextField
                      value={billingStreet1}
                      onChange={(e) => setBillingStreet1(e.target.value)}
                      fullWidth
                      inputProps={{ maxLength: 200 }}
                    />
                  </LabeledField>
                  <LabeledField label="Apt / suite / unit">
                    <TextField
                      value={billingStreet2}
                      onChange={(e) => setBillingStreet2(e.target.value)}
                      fullWidth
                      inputProps={{ maxLength: 100 }}
                    />
                  </LabeledField>
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                    <Box sx={{ flex: 2 }}>
                      <LabeledField label="City">
                        <TextField
                          value={billingCity}
                          onChange={(e) => setBillingCity(e.target.value)}
                          fullWidth
                          inputProps={{ maxLength: 100 }}
                        />
                      </LabeledField>
                    </Box>
                    <Box sx={{ flex: 1 }}>
                      <LabeledField label="State">
                        <TextField
                          value={billingState}
                          onChange={(e) => setBillingState(e.target.value)}
                          fullWidth
                          inputProps={{ maxLength: 50 }}
                        />
                      </LabeledField>
                    </Box>
                    <Box sx={{ flex: 1 }}>
                      <LabeledField label="ZIP / postal">
                        <TextField
                          value={billingPostalCode}
                          onChange={(e) => setBillingPostalCode(e.target.value)}
                          fullWidth
                          inputProps={{ maxLength: 10 }}
                          error={
                            !!billingPostalCode.trim() &&
                            !/^\d{5}(-\d{4})?$/.test(billingPostalCode.trim())
                          }
                        />
                      </LabeledField>
                    </Box>
                  </Stack>
                </Stack>
              )}
            </Box>
            <LabeledField label="Relationship">
              <TextField
                select
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
                fullWidth
              >
                {ROLE_OPTIONS.map((r) => (
                  <MenuItem key={r} value={r}>{r}</MenuItem>
                ))}
              </TextField>
            </LabeledField>

            {patch.error && (
              <Alert severity="error" onClose={() => patch.reset()}>
                {patch.error.message}
              </Alert>
            )}
            {remove.error && (
              <Alert severity="error" onClose={() => remove.reset()}>
                {remove.error.message}
              </Alert>
            )}
          </Stack>

          {/* Danger zone */}
          <Divider sx={{ my: 3 }} />
          <Box>
            <Typography variant="overline" color="error.main">
              Danger zone
            </Typography>
            {!confirmingRemove ? (
              <Button
                color="error"
                variant="outlined"
                startIcon={<DeleteOutlineIcon />}
                onClick={() => setConfirmingRemove(true)}
                sx={{ mt: 1 }}
              >
                Remove from family
              </Button>
            ) : (
              <Stack spacing={1} sx={{ mt: 1 }}>
                <Typography variant="body2" color="text.secondary">
                  Detach {parent?.name} from this family? The contact record
                  stays in the address book.
                </Typography>
                <Stack direction="row" spacing={1}>
                  <Button
                    color="error"
                    variant="contained"
                    onClick={() => remove.mutate()}
                    disabled={remove.isPending}
                  >
                    Confirm remove
                  </Button>
                  <Button onClick={() => setConfirmingRemove(false)}>
                    Cancel
                  </Button>
                </Stack>
              </Stack>
            )}
          </Box>
        </Box>

        {/* Sticky save row */}
        <Box
          sx={{
            mt: 2,
            pt: 2,
            borderTop: 1,
            borderColor: "divider",
            display: "flex",
            justifyContent: "flex-end",
            gap: 1,
          }}
        >
          <Button onClick={onClose} disabled={patch.isPending}>
            Close
          </Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={saveDisabled}
          >
            Save changes
          </Button>
        </Box>
      </Box>
    </Drawer>
  );
}
