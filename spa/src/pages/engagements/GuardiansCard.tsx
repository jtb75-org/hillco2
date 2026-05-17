import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Chip,
  FormControlLabel,
  Paper,
  Stack,
  Switch,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useSnackbar } from "../../components/Snackbar";

interface Guardian {
  id: string;
  family_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  is_primary_contact: boolean;
  is_billing_contact: boolean;
  mailing_address: string | null;
  billing_address: string | null;
}

interface FamilyDetail {
  id: string;
  household_name: string;
  parents: Guardian[];
}

const ROLE_LABEL: Record<string, string> = {
  mom: "Mom",
  dad: "Dad",
  guardian: "Guardian",
  other: "Other",
};

export function GuardiansCard({ familyId }: { familyId: string }) {
  const qc = useQueryClient();
  const snackbar = useSnackbar();

  const family = useQuery<FamilyDetail, Error>({
    queryKey: ["families", familyId],
    queryFn: async () => {
      const res = await fetch(`/api/families/${familyId}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load family.");
      return res.json();
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["families", familyId] });
  };

  const patchGuardian = useMutation({
    mutationFn: async ({
      id,
      body,
    }: {
      id: string;
      body: { is_primary_contact?: boolean; is_billing_contact?: boolean };
    }) => {
      const res = await fetch(`/api/parents/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { detail?: string }).detail ?? "Update failed.");
      }
    },
    onSuccess: invalidate,
    onError: (e: Error) => snackbar.show(e.message, "error"),
  });

  const guardians = family.data?.parents ?? [];

  return (
    <Paper variant="outlined" sx={{ p: 0 }}>
      <Accordion
        defaultExpanded
        disableGutters
        elevation={0}
        sx={{
          "&:before": { display: "none" },
          bgcolor: "transparent",
        }}
      >
        <AccordionSummary
          expandIcon={<ExpandMoreIcon />}
          sx={{
            px: 2.5,
            "& .MuiAccordionSummary-content": {
              my: 1.25,
              alignItems: "center",
              gap: 1,
            },
          }}
        >
          <Typography variant="overline" color="text.secondary">
            Guardians
          </Typography>
          <Typography variant="caption" color="text.disabled">
            ({guardians.length})
          </Typography>
        </AccordionSummary>
        <AccordionDetails sx={{ px: 2.5, pt: 0, pb: 2 }}>
          {family.isPending ? (
            <Typography variant="body2" color="text.disabled">
              Loading…
            </Typography>
          ) : guardians.length === 0 ? (
            <Typography variant="body2" color="text.disabled">
              No guardians on this family. Add them on the family page.
            </Typography>
          ) : (
            <Stack divider={<Box sx={{ borderTop: 1, borderColor: "divider" }} />}>
              {guardians.map((g) => (
                <GuardianRow
                  key={g.id}
                  guardian={g}
                  onTogglePrimary={(v) =>
                    patchGuardian.mutate({
                      id: g.id,
                      body: { is_primary_contact: v },
                    })
                  }
                  onToggleBilling={(v) =>
                    patchGuardian.mutate({
                      id: g.id,
                      body: { is_billing_contact: v },
                    })
                  }
                  busy={patchGuardian.isPending}
                />
              ))}
            </Stack>
          )}
        </AccordionDetails>
      </Accordion>
    </Paper>
  );
}

function GuardianRow({
  guardian,
  onTogglePrimary,
  onToggleBilling,
  busy,
}: {
  guardian: Guardian;
  onTogglePrimary: (v: boolean) => void;
  onToggleBilling: (v: boolean) => void;
  busy: boolean;
}) {
  return (
    <Stack
      direction={{ xs: "column", md: "row" }}
      spacing={1.5}
      alignItems={{ md: "flex-start" }}
      sx={{ py: 1.5 }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            {guardian.name}
          </Typography>
          {guardian.role && (
            <Chip
              size="small"
              variant="outlined"
              label={ROLE_LABEL[guardian.role] ?? guardian.role}
              sx={{ height: 20, fontSize: 11 }}
            />
          )}
          {guardian.is_primary_contact && (
            <Chip size="small" color="primary" label="Primary" sx={{ height: 20 }} />
          )}
          {guardian.is_billing_contact && (
            <Chip size="small" color="success" label="Billing" sx={{ height: 20 }} />
          )}
        </Stack>
        <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap" }}>
          {guardian.email && (
            <Typography variant="caption" color="text.secondary">
              {guardian.email}
            </Typography>
          )}
          {guardian.phone && (
            <Typography variant="caption" color="text.secondary">
              {guardian.phone}
            </Typography>
          )}
        </Stack>
        {(guardian.mailing_address || guardian.billing_address) && (
          <Box sx={{ mt: 0.75 }}>
            {guardian.mailing_address && (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: "block", whiteSpace: "pre-line" }}
              >
                {guardian.mailing_address}
              </Typography>
            )}
            {guardian.billing_address &&
              guardian.billing_address !== guardian.mailing_address && (
                <Typography
                  variant="caption"
                  color="text.disabled"
                  sx={{ display: "block", whiteSpace: "pre-line", mt: 0.5 }}
                >
                  Billing: {guardian.billing_address}
                </Typography>
              )}
          </Box>
        )}
      </Box>
      <Stack
        direction="row"
        spacing={2}
        sx={{ flexWrap: "wrap", alignItems: "center" }}
      >
        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={guardian.is_primary_contact}
              disabled={busy}
              onChange={(e) => onTogglePrimary(e.target.checked)}
            />
          }
          label={
            <Typography variant="caption" color="text.secondary">
              Primary
            </Typography>
          }
          sx={{ mr: 0 }}
        />
        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={guardian.is_billing_contact}
              disabled={busy}
              onChange={(e) => onToggleBilling(e.target.checked)}
            />
          }
          label={
            <Typography variant="caption" color="text.secondary">
              Billing
            </Typography>
          }
          sx={{ mr: 0 }}
        />
      </Stack>
    </Stack>
  );
}
