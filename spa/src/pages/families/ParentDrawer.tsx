import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
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
import { useMutation } from "@tanstack/react-query";

import { api } from "../../api/client";
import type { components } from "../../api/schema";
import { LabeledField } from "../../components/LabeledField";

type ParentUpdate = components["schemas"]["ParentUpdate"];
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
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  // Hydrate form from the parent whenever a new one is opened.
  useEffect(() => {
    if (!parent) return;
    const parts = (parent.name || "").split(/\s+/);
    setFirstName(parts[0] ?? "");
    setLastName(parts.slice(1).join(" "));
    setEmail(parent.email ?? "");
    setPhone(parent.phone ?? "");
    setStreet1("");
    setStreet2("");
    setCity("");
    setStateCode("");
    setPostalCode("");
    setRole((parent.role as Role) || "other");
    setConfirmingRemove(false);
  }, [parent]);

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
    const body: ParentUpdate = {
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      email: email.trim() || null,
      phone: phone.trim() || null,
      role,
    };
    if (street1) body.street1 = street1.trim();
    if (street2) body.street2 = street2.trim();
    if (city) body.city = city.trim();
    if (stateCode) body.state = stateCode.trim();
    if (postalCode) body.postal_code = postalCode.trim();
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
