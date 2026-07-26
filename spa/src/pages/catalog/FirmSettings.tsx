import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { SectionPanel } from "../../components/SectionPanel";
import { useSnackbar } from "../../components/Snackbar";

interface OrgSettings {
  firm_name: string | null;
  firm_street1: string | null;
  firm_street2: string | null;
  firm_city: string | null;
  firm_state: string | null;
  firm_postal_code: string | null;
  firm_country: string | null;
  governing_state: string | null;
  billing_increment_minutes: number | null;
  invoice_frequency: string | null;
  payment_terms_days: number | null;
  expense_approval_threshold: string | null;
}

const EMPTY: OrgSettings = {
  firm_name: null,
  firm_street1: null,
  firm_street2: null,
  firm_city: null,
  firm_state: null,
  firm_postal_code: null,
  firm_country: null,
  governing_state: null,
  billing_increment_minutes: null,
  invoice_frequency: null,
  payment_terms_days: null,
  expense_approval_threshold: null,
};

export function CatalogFirmSettings() {
  const qc = useQueryClient();
  const snackbar = useSnackbar();
  const [draft, setDraft] = useState<OrgSettings>(EMPTY);

  const settings = useQuery<OrgSettings, Error>({
    queryKey: ["org-settings"],
    queryFn: async () => {
      const res = await fetch("/api/org-settings", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load firm settings.");
      return res.json();
    },
  });

  useEffect(() => {
    if (settings.data) setDraft(settings.data);
  }, [settings.data]);

  const save = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/org-settings", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { detail?: string }).detail ?? "Save failed.");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org-settings"] });
      snackbar.show("Firm settings saved");
    },
    onError: (e: Error) => snackbar.show(e.message, "error"),
  });

  const text = (key: keyof OrgSettings) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDraft((prev) => ({ ...prev, [key]: e.target.value || null }));

  const num = (key: keyof OrgSettings) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDraft((prev) => ({
      ...prev,
      [key]: e.target.value === "" ? null : Number(e.target.value),
    }));

  if (settings.isPending) {
    return <Typography variant="body2" color="text.disabled">Loading…</Typography>;
  }

  return (
    <Stack spacing={2.5}>
      <Alert severity="info" variant="outlined">
        These values auto-fill the corresponding{" "}
        <Box component="code" sx={{ fontFamily: "monospace" }}>{`{{snake_case}}`}</Box>{" "}
        placeholders in contract templates. Per-agreement variable overrides
        win if set; firm settings are the fallback.
      </Alert>

      <SectionPanel title="Firm identity" titleVariant="overline">
        <Stack spacing={1.5} sx={{ p: 2.5 }}>
          <TextField
            label="Firm name"
            size="small"
            placeholder="HillCo Educational Consulting"
            value={draft.firm_name ?? ""}
            onChange={text("firm_name")}
          />
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
            <TextField
              label="Street"
              size="small"
              value={draft.firm_street1 ?? ""}
              onChange={text("firm_street1")}
              sx={{ flex: 2 }}
            />
            <TextField
              label="Suite / Apt"
              size="small"
              value={draft.firm_street2 ?? ""}
              onChange={text("firm_street2")}
              sx={{ flex: 1 }}
            />
          </Stack>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
            <TextField
              label="City"
              size="small"
              value={draft.firm_city ?? ""}
              onChange={text("firm_city")}
              sx={{ flex: 2 }}
            />
            <TextField
              label="State"
              size="small"
              value={draft.firm_state ?? ""}
              onChange={text("firm_state")}
              sx={{ flex: 1 }}
            />
            <TextField
              label="ZIP"
              size="small"
              value={draft.firm_postal_code ?? ""}
              onChange={text("firm_postal_code")}
              sx={{ flex: 1 }}
            />
            <TextField
              label="Country"
              size="small"
              value={draft.firm_country ?? ""}
              onChange={text("firm_country")}
              sx={{ flex: 1 }}
            />
          </Stack>
          <Typography variant="caption" color="text.disabled">
            Used as fallback for{" "}
            <Box component="code" sx={{ fontFamily: "monospace" }}>{`{{consultant_address}}`}</Box>{" "}
            when the lead consultant's own address isn't set.
          </Typography>
        </Stack>
      </SectionPanel>

      <SectionPanel title="Contract defaults" titleVariant="overline">
        <Stack spacing={1.5} sx={{ p: 2.5 }}>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
            <TextField
              label="Governing state"
              size="small"
              placeholder="Indiana"
              value={draft.governing_state ?? ""}
              onChange={text("governing_state")}
              helperText={`{{governing_state}}`}
              sx={{ flex: 1 }}
            />
            <TextField
              label="Billing increment (minutes)"
              type="number"
              inputProps={{ min: 1, max: 240 }}
              size="small"
              value={draft.billing_increment_minutes ?? ""}
              onChange={num("billing_increment_minutes")}
              helperText={`{{billing_increment_minutes}}`}
              sx={{ flex: 1 }}
            />
          </Stack>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
            <TextField
              select
              label="Invoice frequency"
              size="small"
              value={draft.invoice_frequency ?? ""}
              onChange={(e) =>
                setDraft((prev) => ({
                  ...prev,
                  invoice_frequency: e.target.value || null,
                }))
              }
              helperText={`{{invoice_frequency}}`}
              sx={{ flex: 1 }}
            >
              <MenuItem value="">—</MenuItem>
              <MenuItem value="weekly">Weekly</MenuItem>
              <MenuItem value="biweekly">Biweekly</MenuItem>
              <MenuItem value="monthly">Monthly</MenuItem>
            </TextField>
            <TextField
              label="Payment terms (days)"
              type="number"
              inputProps={{ min: 1, max: 365 }}
              size="small"
              value={draft.payment_terms_days ?? ""}
              onChange={num("payment_terms_days")}
              helperText={`{{payment_terms_days}}`}
              sx={{ flex: 1 }}
            />
            <TextField
              label="Expense approval threshold ($)"
              type="number"
              inputProps={{ step: "0.01", min: 0 }}
              size="small"
              value={draft.expense_approval_threshold ?? ""}
              onChange={text("expense_approval_threshold")}
              helperText={`{{expense_approval_threshold}}`}
              sx={{ flex: 1 }}
            />
          </Stack>
        </Stack>
      </SectionPanel>

      <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
        <Button
          variant="contained"
          onClick={() => save.mutate()}
          disabled={save.isPending}
        >
          {save.isPending ? "Saving…" : "Save firm settings"}
        </Button>
      </Box>
    </Stack>
  );
}
