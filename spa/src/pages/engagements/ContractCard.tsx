import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Link,
  MenuItem,
  Select,
  Stack,
  TextField,
  FormControlLabel,
  Switch,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import AttachFileIcon from "@mui/icons-material/AttachFile";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import HistoryIcon from "@mui/icons-material/History";
import PictureAsPdfOutlinedIcon from "@mui/icons-material/PictureAsPdfOutlined";
import SendOutlinedIcon from "@mui/icons-material/SendOutlined";
import dayjs from "dayjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link as RouterLink } from "react-router-dom";

import { ContractBodyEditor } from "../../components/ContractBodyEditor";
import { SectionPanel } from "../../components/SectionPanel";
import { useSnackbar } from "../../components/Snackbar";

type AgreementType = "services_contract" | "medical_release";
type AgreementStatus =
  | "draft"
  | "active"
  | "superseded"
  | "expired"
  | "terminated";

interface Agreement {
  id: string;
  engagement_id: string;
  type: AgreementType;
  status: AgreementStatus;
  contract_number: string | null;
  amount: string | null;
  sent_at: string | null;
  signed_at: string | null;
  effective_date: string | null;
  expires_at: string | null;
  supersedes_id: string | null;
  document_id: string | null;
  notes: string | null;
  template_id: string | null;
  body_markdown: string | null;
  variables: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  created_by_name?: string | null;
}

interface ContractTemplate {
  id: string;
  kind: AgreementType;
  name: string;
  body_markdown: string;
  variables: string[];
  is_active: boolean;
}

interface RenderContext {
  template_id: string;
  detected: string[];
  filled: Record<string, unknown>;
  missing: string[];
  hints: Record<string, string>;
  engagement_id: string;
  family_id: string;
  student_id: string | null;
  lead_consultant_id: string | null;
}

const HINT_LABEL: Record<string, string> = {
  lead_consultant: "Set on the lead consultant's profile",
  lead_consultant_or_firm_settings: "Set on the lead consultant or Firm settings as fallback",
  firm_settings: "Set in Catalog → Firm settings",
  engagement: "Set on this engagement",
  family: "Set on the family record",
  student: "Set on the student record",
  "agreement-override": "No source — fill below",
};

function hrefForHint(
  hint: string,
  ctx: { engagement_id: string; family_id: string; student_id: string | null },
): string | null {
  switch (hint) {
    case "firm_settings":
    case "lead_consultant_or_firm_settings":
      return "/catalog/firm-settings";
    case "engagement":
      return `/engagements/${ctx.engagement_id}`;
    case "family":
      return `/families/${ctx.family_id}`;
    case "student":
      return ctx.student_id ? `/students/${ctx.student_id}` : null;
    case "lead_consultant":
    case "agreement-override":
    default:
      return null;
  }
}

function prettyVariable(name: string): string {
  return name
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// Sensible starting values for operator-typed contract variables. The New
// Agreement dialog seeds these into the inline fields, pre-filled but fully
// editable per contract.
const VARIABLE_DEFAULTS: Record<string, string> = {
  payment_schedule: "50% on signing, 50% on completion",
};

type LifecycleState =
  | "drafted"
  | "sent"
  | "signed"
  | "superseded"
  | "expired"
  | "terminated";

const TYPE_LABEL: Record<AgreementType, string> = {
  services_contract: "Services contract",
  medical_release: "Medical records release",
};

const LIFECYCLE_LABEL: Record<LifecycleState, string> = {
  drafted: "Drafted",
  sent: "Sent — awaiting signature",
  signed: "Signed",
  superseded: "Superseded",
  expired: "Expired",
  terminated: "Terminated",
};

const LIFECYCLE_TONE: Record<LifecycleState, "default" | "warning" | "info" | "success" | "error"> = {
  drafted: "default",
  sent: "warning",
  signed: "success",
  superseded: "default",
  expired: "error",
  terminated: "error",
};

function lifecycleOf(a: Agreement): LifecycleState {
  if (a.status === "active") return "signed";
  if (a.status === "draft") return a.sent_at ? "sent" : "drafted";
  return a.status as LifecycleState;
}

export function ContractCard({
  engagementId,
  billingMode,
  fixedFee,
}: {
  engagementId: string;
  billingMode: "hourly" | "fixed";
  fixedFee: string | null;
}) {
  const qc = useQueryClient();
  const snackbar = useSnackbar();
  const [addOpen, setAddOpen] = useState(false);
  const [historyFor, setHistoryFor] = useState<AgreementType | null>(null);
  const [editBodyFor, setEditBodyFor] = useState<Agreement | null>(null);

  const agreements = useQuery<Agreement[], Error>({
    queryKey: ["engagements", engagementId, "agreements"],
    queryFn: async () => {
      const res = await fetch(`/api/engagements/${engagementId}/agreements`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load agreements.");
      return res.json();
    },
  });

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["engagements", engagementId, "agreements"] });

  const markSent = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/agreements/${id}/mark-sent`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { detail?: string }).detail ?? "Mark-sent failed.");
      }
      return res.json();
    },
    onSuccess: invalidate,
    onError: (e: Error) => snackbar.show(e.message, "error"),
  });

  const sendForSignature = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/agreements/${id}/send-for-signature`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { detail?: string }).detail ?? "Could not send for signature.");
      }
      return res.json() as Promise<{ sent_to: string }>;
    },
    onSuccess: (data) => {
      invalidate();
      snackbar.show(`Signing link sent to ${data.sent_to}`, "success");
    },
    onError: (e: Error) => snackbar.show(e.message, "error"),
  });

  const uploadSigned = useMutation({
    mutationFn: async ({ id, file }: { id: string; file: File }) => {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/agreements/${id}/upload-signed`, {
        method: "POST",
        credentials: "include",
        body: form,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { detail?: string }).detail ?? "Upload failed.");
      }
      return res.json();
    },
    onSuccess: () => {
      invalidate();
      snackbar.show("Signed copy attached", "success");
    },
    onError: (e: Error) => snackbar.show(e.message, "error"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/agreements/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok && res.status !== 204) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { detail?: string }).detail ?? "Delete failed.");
      }
    },
    onSuccess: invalidate,
    onError: (e: Error) => snackbar.show(e.message, "error"),
  });

  const all = agreements.data ?? [];
  const byType = (t: AgreementType) =>
    all.filter((a) => a.type === t).sort(byCreatedDesc);
  const currentOf = (t: AgreementType) => {
    const list = byType(t);
    // Active first; otherwise most recent draft. Superseded/expired
    // live in the history sub-dialog, not the main row.
    return list.find((a) => a.status === "active")
      ?? list.find((a) => a.status === "draft")
      ?? list[0] ?? null;
  };

  return (
    <SectionPanel
      title="Contracts"
      titleVariant="overline"
      actions={
        <Button size="small" startIcon={<AddIcon />} onClick={() => setAddOpen(true)}>
          New agreement
        </Button>
      }
    >
      <Box sx={{ p: 2.5 }}>
        {(["services_contract", "medical_release"] as AgreementType[]).map((t) => {
          const list = byType(t);
          const current = currentOf(t);
          const history = list.filter((a) => a.id !== current?.id);
          return (
            <Box key={t} sx={{ mb: 2, "&:last-of-type": { mb: 0 } }}>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                  {TYPE_LABEL[t]}
                </Typography>
                {history.length > 0 && (
                  <Button
                    size="small"
                    startIcon={<HistoryIcon fontSize="small" />}
                    onClick={() => setHistoryFor(t)}
                    sx={{ ml: "auto", color: "text.secondary" }}
                  >
                    {history.length} prior
                  </Button>
                )}
              </Stack>
              {current ? (
                <AgreementRow
                  agreement={current}
                  onMarkSent={() => markSent.mutate(current.id)}
                  onSendForSignature={() => sendForSignature.mutate(current.id)}
                  onUploadSigned={(file) => uploadSigned.mutate({ id: current.id, file })}
                  onRemove={() => remove.mutate(current.id)}
                  onEditBody={() => setEditBodyFor(current)}
                  busy={
                    markSent.isPending ||
                    sendForSignature.isPending ||
                    uploadSigned.isPending ||
                    remove.isPending
                  }
                />
              ) : (
                <Typography variant="body2" color="text.disabled" sx={{ ml: 0.5 }}>
                  No {TYPE_LABEL[t].toLowerCase()} yet.
                </Typography>
              )}
            </Box>
          );
        })}
      </Box>

      <AddAgreementDialog
        open={addOpen}
        engagementId={engagementId}
        billingMode={billingMode}
        fixedFee={fixedFee}
        existingTypes={new Set(
          all.filter((a) => a.status !== "superseded" && a.status !== "expired" && a.status !== "terminated").map((a) => a.type),
        )}
        onClose={() => setAddOpen(false)}
        onCreated={() => {
          setAddOpen(false);
          invalidate();
        }}
      />

      <HistoryDialog
        open={!!historyFor}
        type={historyFor}
        rows={historyFor ? byType(historyFor) : []}
        onClose={() => setHistoryFor(null)}
      />

      <ContractBodyDialog
        agreement={editBodyFor}
        onClose={() => setEditBodyFor(null)}
        onSaved={() => {
          setEditBodyFor(null);
          invalidate();
        }}
      />
    </SectionPanel>
  );
}

function byCreatedDesc(a: Agreement, b: Agreement) {
  return b.created_at.localeCompare(a.created_at);
}

function AgreementRow({
  agreement,
  onMarkSent,
  onSendForSignature,
  onUploadSigned,
  onRemove,
  onEditBody,
  busy,
}: {
  agreement: Agreement;
  onMarkSent: () => void;
  onSendForSignature: () => void;
  onUploadSigned: (file: File) => void;
  onRemove: () => void;
  onEditBody: () => void;
  busy: boolean;
}) {
  const state = lifecycleOf(agreement);
  const fileRef = useRef<HTMLInputElement | null>(null);
  return (
    <Box
      data-testid={`agreement-row-${agreement.id}`}
      data-agreement-type={agreement.type}
      sx={{
        border: 1,
        borderColor: "divider",
        borderRadius: 1,
        p: 1.5,
      }}
    >
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flexWrap: "wrap" }}>
        <Chip
          size="small"
          color={LIFECYCLE_TONE[state] as "default" | "warning" | "info" | "success" | "error"}
          label={LIFECYCLE_LABEL[state]}
          variant={state === "drafted" ? "outlined" : "filled"}
        />
        {agreement.contract_number && (
          <Typography variant="caption" color="text.secondary">
            {agreement.contract_number}
          </Typography>
        )}
        {agreement.amount && (
          <Typography variant="caption" color="text.secondary">
            ${agreement.amount}
          </Typography>
        )}
        <Box sx={{ ml: "auto" }} />
        {/* A signed agreement is immutable: the signed file is the record,
            so the draft-body editor and the live-render preview go away
            (the preview would re-render today's data, not what was signed).
            Only if no signed file exists does the preview stay as the one
            way to see the document. */}
        {agreement.body_markdown !== null && state !== "signed" && (
          <Button
            size="small"
            data-testid={`agreement-edit-${agreement.id}`}
            startIcon={<DescriptionOutlinedIcon fontSize="small" />}
            onClick={onEditBody}
            sx={{ color: "text.secondary" }}
          >
            View / Edit
          </Button>
        )}
        {agreement.body_markdown !== null &&
          (state !== "signed" || !agreement.document_id) && (
            <Button
              size="small"
              data-testid={`agreement-pdf-${agreement.id}`}
              href={`/api/agreements/${agreement.id}/pdf`}
              target="_blank"
              startIcon={<PictureAsPdfOutlinedIcon fontSize="small" />}
              sx={{ color: "text.secondary" }}
            >
              Preview PDF
            </Button>
          )}
        {state === "drafted" && (
          <>
            {agreement.body_markdown !== null && (
              <Button
                size="small"
                variant="contained"
                data-testid={`agreement-send-esign-${agreement.id}`}
                startIcon={<SendOutlinedIcon fontSize="small" />}
                onClick={onSendForSignature}
                disabled={busy}
              >
                Send for signature
              </Button>
            )}
            <Button
              size="small"
              onClick={onMarkSent}
              disabled={busy}
              sx={{ color: "text.secondary" }}
            >
              Mark sent manually
            </Button>
            <IconButton
              size="small"
              aria-label="Delete draft"
              onClick={onRemove}
              disabled={busy}
              sx={{ color: "text.disabled", "&:hover": { color: "error.main" } }}
            >
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          </>
        )}
        {state === "sent" && (
          <>
            <Button
              size="small"
              startIcon={<SendOutlinedIcon fontSize="small" />}
              onClick={onSendForSignature}
              disabled={busy}
              sx={{ color: "text.secondary" }}
            >
              Resend link
            </Button>
            <Button
              size="small"
              variant="contained"
              startIcon={<AttachFileIcon fontSize="small" />}
              onClick={() => fileRef.current?.click()}
              disabled={busy}
            >
              Upload signed
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,.pdf,.doc,.docx,image/*"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onUploadSigned(file);
                e.target.value = "";
              }}
            />
          </>
        )}
        {state === "signed" && agreement.document_id && (
          <Button
            size="small"
            href={`/api/documents/${agreement.document_id}/download`}
            target="_blank"
            startIcon={<DescriptionOutlinedIcon fontSize="small" />}
          >
            View signed
          </Button>
        )}
      </Stack>
      <Stack direction="row" spacing={2} sx={{ mt: 1, flexWrap: "wrap" }}>
        {agreement.sent_at && (
          <Typography variant="caption" color="text.secondary">
            Sent {dayjs(agreement.sent_at).format("MMM D, YYYY")}
          </Typography>
        )}
        {agreement.signed_at && (
          <Typography variant="caption" color="text.secondary">
            Signed {dayjs(agreement.signed_at).format("MMM D, YYYY")}
          </Typography>
        )}
        {agreement.effective_date && (
          <Typography variant="caption" color="text.secondary">
            Effective {dayjs(agreement.effective_date).format("MMM D, YYYY")}
          </Typography>
        )}
        {agreement.expires_at && (
          <Typography variant="caption" color="text.secondary">
            Expires {dayjs(agreement.expires_at).format("MMM D, YYYY")}
          </Typography>
        )}
      </Stack>
      {agreement.notes && (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ mt: 1, whiteSpace: "pre-line" }}
        >
          {agreement.notes}
        </Typography>
      )}
    </Box>
  );
}

function AddAgreementDialog({
  open,
  engagementId,
  billingMode,
  fixedFee,
  existingTypes,
  onClose,
  onCreated,
}: {
  open: boolean;
  engagementId: string;
  billingMode: "hourly" | "fixed";
  fixedFee: string | null;
  existingTypes: Set<AgreementType>;
  onClose: () => void;
  onCreated: () => void;
}) {
  const snackbar = useSnackbar();
  const [type, setType] = useState<AgreementType>("services_contract");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [templateId, setTemplateId] = useState<string>("");
  // The billing mode already determines the right template, so it's
  // auto-selected and shown read-only. This reveals the dropdown for the
  // rare override (a different template, or Blank).
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [varInputs, setVarInputs] = useState<Record<string, string>>({});
  const alreadyHasActive = existingTypes.has(type);

  const templates = useQuery<ContractTemplate[], Error>({
    queryKey: ["contract-templates", { kind: type, billingMode }],
    enabled: open,
    queryFn: async () => {
      // billing_mode orders the matching services-contract template first
      // (hourly vs fixed), so the auto-select below picks the right one.
      const res = await fetch(
        `/api/contract-templates?kind=${type}&billing_mode=${billingMode}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error("Failed to load templates.");
      return res.json();
    },
  });

  // Auto-select the first available template when the type changes
  // (or when templates first arrive). User can switch to "(blank)".
  const firstTemplateId = templates.data?.[0]?.id ?? "";
  if (open && templates.data && templateId === "" && firstTemplateId) {
    setTemplateId(firstTemplateId);
  }

  // Render-context preview: what's filled / missing for the chosen
  // template against this engagement. Drives the inline variable form
  // + the Create-button gate.
  const renderContext = useQuery<RenderContext, Error>({
    queryKey: ["contract-templates", templateId, "render-context", engagementId],
    enabled: open && !!templateId,
    queryFn: async () => {
      const res = await fetch(
        `/api/contract-templates/${templateId}/render-context?engagement_id=${engagementId}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error("Failed to load render context.");
      return res.json();
    },
  });

  // Reset typed values when the template changes — values from the
  // previous template's missing-list don't apply to the new one.
  useEffect(() => {
    setVarInputs({});
  }, [templateId]);

  // Pre-fill Amount from the engagement's snapshotted fixed fee for a
  // fixed-bid services contract (editable). The backend also defaults the
  // amount from fixed_fee, but showing it avoids a misleading empty field.
  useEffect(() => {
    if (open && billingMode === "fixed" && fixedFee && type === "services_contract") {
      // fixed_fee comes over the wire as a JSON number despite the string type;
      // coerce so the Amount state stays a string (setAmount / .trim() rely on it).
      setAmount((prev) => (prev.trim() === "" ? String(fixedFee) : prev));
    }
  }, [open, billingMode, fixedFee, type]);

  // Pre-fill sensible defaults for operator-typed variables that are
  // otherwise blank, so a fresh contract starts filled but editable.
  // Only seeds keys the operator hasn't touched.
  const missingKey = (renderContext.data?.missing ?? []).join(",");
  useEffect(() => {
    const miss = renderContext.data?.missing ?? [];
    setVarInputs((prev) => {
      let next = prev;
      for (const [k, def] of Object.entries(VARIABLE_DEFAULTS)) {
        if (miss.includes(k) && !(prev[k] ?? "").trim()) {
          if (next === prev) next = { ...prev };
          next[k] = def;
        }
      }
      return next;
    });
    // missingKey captures the set of missing vars; re-seed when it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missingKey]);

  const allMissing = renderContext.data?.missing ?? [];
  const hints = renderContext.data?.hints ?? {};
  const hintOf = (v: string) => hints[v] ?? "agreement-override";
  // "signer" variables (e.g. the releasing provider on a medical release) are
  // filled by the client on the signing page — they never block the operator's
  // draft creation, so drop them from the required set entirely.
  const signerMissing = allMissing.filter((v) => hintOf(v) === "signer");
  const missing = allMissing.filter((v) => hintOf(v) !== "signer");
  // Two-bucket gate: variables with a known source must be resolved
  // at that source (the dialog auto-refetches on window focus, so
  // tabbing back after fixing it picks up the new value). Variables
  // with no source ("agreement-override") still need an inline value.
  const overrideMissing = missing.filter((v) => hintOf(v) === "agreement-override");
  const sourceMissing = missing.filter((v) => hintOf(v) !== "agreement-override");
  const allMissingFilled =
    sourceMissing.length === 0 &&
    overrideMissing.every((v) => (varInputs[v] ?? "").trim() !== "");

  // What's *actually* still unfilled, accounting for inline values the
  // operator has typed or that were pre-filled — so the warning reflects
  // the real gap, not the server's stateless view. Source-backed vars
  // always count (they can only be resolved at their source).
  const stillMissing = missing.filter((v) =>
    hintOf(v) === "agreement-override"
      ? (varInputs[v] ?? "").trim() === ""
      : true,
  );
  const stillMissingHasSource = stillMissing.some(
    (v) => hintOf(v) !== "agreement-override",
  );

  const reset = () => {
    setType("services_contract");
    setAmount("");
    setNotes("");
    setTemplateId("");
    setShowTemplatePicker(false);
    setVarInputs({});
  };

  const create = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/engagements/${engagementId}/agreements`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          amount: String(amount).trim() || null,
          notes: notes.trim() || null,
          template_id: templateId || null,
          variables: Object.fromEntries(
            Object.entries(varInputs)
              .filter(([, v]) => (v ?? "").trim() !== "")
              .map(([k, v]) => [k, v.trim()]),
          ),
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { detail?: string }).detail ?? "Create failed.");
      }
      return res.json();
    },
    onSuccess: () => {
      reset();
      onCreated();
    },
    onError: (e: Error) => snackbar.show(e.message, "error"),
  });

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (create.isPending) return;
        onClose();
        reset();
      }}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle>New agreement</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Select
            data-testid="agreement-type-select"
            size="small"
            value={type}
            onChange={(e) => {
              setType(e.target.value as AgreementType);
              setTemplateId("");
              setShowTemplatePicker(false);
            }}
          >
            <MenuItem value="services_contract">Services contract</MenuItem>
            <MenuItem value="medical_release">Medical records release</MenuItem>
          </Select>
          <Box>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: "block", mb: 0.5 }}
            >
              Template
            </Typography>
            {showTemplatePicker ? (
              <Select
                data-testid="agreement-template-select"
                size="small"
                fullWidth
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                displayEmpty
              >
                <MenuItem value="">
                  <em>Blank (no template)</em>
                </MenuItem>
                {(templates.data ?? []).map((t) => (
                  <MenuItem key={t.id} value={t.id}>
                    {t.name}
                  </MenuItem>
                ))}
              </Select>
            ) : (
              <Box
                sx={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 1,
                  flexWrap: "wrap",
                }}
              >
                <Typography variant="body2" data-testid="agreement-template-name">
                  {templateId
                    ? (templates.data ?? []).find((t) => t.id === templateId)?.name ??
                      "Selected template"
                    : "Blank (no template)"}
                </Typography>
                <Link
                  component="button"
                  type="button"
                  variant="caption"
                  underline="hover"
                  onClick={() => setShowTemplatePicker(true)}
                  data-testid="agreement-template-change"
                >
                  Change
                </Link>
              </Box>
            )}
            {templates.data && templates.data.length === 0 && (
              <Typography variant="caption" color="text.disabled" sx={{ display: "block", mt: 0.5 }}>
                No templates configured for this type. Manage them in
                Catalog → Contracts.
              </Typography>
            )}
          </Box>
          {alreadyHasActive && (
            <Alert severity="info">
              This engagement already has an active or in-progress {TYPE_LABEL[type].toLowerCase()}.
              Creating a new one is allowed, but the partial unique index
              on active-per-type will block activation until the existing one
              is superseded.
            </Alert>
          )}
          {type === "services_contract" && (
            <TextField
              label="Amount"
              placeholder="2500.00"
              size="small"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          )}
          <TextField
            label="Notes"
            placeholder="Optional"
            multiline
            minRows={2}
            size="small"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          {templateId && renderContext.data && (
            <Stack spacing={1.25}>
              {signerMissing.length > 0 && (
                <Alert severity="info" variant="outlined" data-testid="signer-fields-note">
                  The client will complete these when they sign:{" "}
                  <Box component="span" sx={{ fontWeight: 600 }}>
                    {signerMissing.map(prettyVariable).join(", ")}
                  </Box>
                  .
                </Alert>
              )}
              {missing.length === 0 ? (
                <Alert severity="success" variant="outlined">
                  {signerMissing.length > 0
                    ? "Nothing for you to fill in — ready to create the draft."
                    : `All ${renderContext.data.detected.length} variables auto-fill from this engagement's data — no fillins needed.`}
                </Alert>
              ) : (
                <Stack spacing={1.25}>
                  {stillMissing.length === 0 ? (
                    <Alert severity="success" variant="outlined">
                      All variables have a value — ready to create the draft.
                    </Alert>
                  ) : (
                    <Alert severity="warning" variant="outlined">
                      {stillMissing.length === 1 ? "1 variable needs" : `${stillMissing.length} variables need`}{" "}
                      a value before this contract can be created:{" "}
                      <Box component="span" sx={{ fontWeight: 600 }}>
                        {stillMissing.map(prettyVariable).join(", ")}
                      </Box>
                      .{stillMissingHasSource && " Fix at the source so future contracts auto-fill too."}
                    </Alert>
                  )}
                  <Stack spacing={1}>
                    {missing.map((v) => {
                      const hint = hints[v] ?? "agreement-override";
                      const href = hrefForHint(hint, {
                        engagement_id: renderContext.data!.engagement_id,
                        family_id: renderContext.data!.family_id,
                        student_id: renderContext.data!.student_id,
                      });
                      const label = prettyVariable(v);
                      const hintLabel = HINT_LABEL[hint] ?? "No source";
                      if (hint === "agreement-override") {
                        return (
                          <TextField
                            key={v}
                            size="small"
                            label={label}
                            value={varInputs[v] ?? ""}
                            onChange={(e) =>
                              setVarInputs((prev) => ({ ...prev, [v]: e.target.value }))
                            }
                            helperText={hintLabel}
                            InputProps={{ sx: { fontSize: 14 } }}
                          />
                        );
                      }
                      return (
                        <Box
                          key={v}
                          sx={{
                            border: 1,
                            borderColor: "divider",
                            borderRadius: 1,
                            px: 1.5,
                            py: 1,
                            display: "flex",
                            alignItems: "center",
                            gap: 1.5,
                          }}
                        >
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            {href ? (
                              <Typography
                                component={RouterLink}
                                to={href}
                                target="_blank"
                                rel="noreferrer"
                                variant="body2"
                                sx={{
                                  fontWeight: 500,
                                  color: "primary.main",
                                  textDecoration: "none",
                                  "&:hover": { textDecoration: "underline" },
                                }}
                              >
                                {label} →
                              </Typography>
                            ) : (
                              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                {label}
                              </Typography>
                            )}
                            <Typography variant="caption" color="text.secondary">
                              {hintLabel}
                            </Typography>
                          </Box>
                        </Box>
                      );
                    })}
                  </Stack>
                </Stack>
              )}
            </Stack>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button
          onClick={() => {
            onClose();
            reset();
          }}
          disabled={create.isPending}
        >
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={() => create.mutate()}
          disabled={create.isPending || (!!templateId && !allMissingFilled)}
        >
          {create.isPending ? "Creating…" : "Create draft"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function HistoryDialog({
  open,
  type,
  rows,
  onClose,
}: {
  open: boolean;
  type: AgreementType | null;
  rows: Agreement[];
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        {type ? `${TYPE_LABEL[type]} history` : "History"}
      </DialogTitle>
      <DialogContent>
        <Stack divider={<Divider />} spacing={1}>
          {rows.map((r) => (
            <Box key={r.id} sx={{ py: 1 }}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Chip
                  size="small"
                  label={LIFECYCLE_LABEL[lifecycleOf(r)]}
                  color={LIFECYCLE_TONE[lifecycleOf(r)] as "default" | "warning" | "info" | "success" | "error"}
                  variant="outlined"
                />
                {r.contract_number && (
                  <Typography variant="caption">{r.contract_number}</Typography>
                )}
                <Typography variant="caption" color="text.secondary" sx={{ ml: "auto" }}>
                  {dayjs(r.created_at).format("MMM D, YYYY")}
                </Typography>
              </Stack>
              {r.notes && (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  {r.notes}
                </Typography>
              )}
            </Box>
          ))}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

// ---- per-agreement contract body editor ----------------------------------

function ContractBodyDialog({
  agreement,
  onClose,
  onSaved,
}: {
  agreement: Agreement | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const snackbar = useSnackbar();
  const [body, setBody] = useState("");
  // Rich editor by default (same one as Catalog → Contracts); the raw
  // markdown textarea stays behind a toggle for anyone who wants it.
  const [sourceMode, setSourceMode] = useState(false);

  // Re-seed local state when the dialog opens onto a different agreement.
  // Tracked via the agreement id so consecutive opens don't carry stale text.
  const [lastSeed, setLastSeed] = useState<string>("");
  if (agreement && lastSeed !== agreement.id) {
    setBody(agreement.body_markdown ?? "");
    setSourceMode(false);
    setLastSeed(agreement.id);
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!agreement) return;
      const res = await fetch(`/api/agreements/${agreement.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body_markdown: body }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { detail?: string }).detail ?? "Save failed.");
      }
    },
    onSuccess: onSaved,
    onError: (e: Error) => snackbar.show(e.message, "error"),
  });

  const liveVariables = (body.match(/\{\{\s*([a-z][a-z0-9_]+)\s*\}\}/g) ?? []).map(
    (m) => m.replace(/[{}\s]/g, ""),
  );
  const uniqueVariables = [...new Set(liveVariables)];

  return (
    <Dialog
      open={agreement !== null}
      onClose={() => !save.isPending && onClose()}
      maxWidth="lg"
      fullWidth
    >
      <DialogTitle>
        Contract body
        {agreement?.contract_number && (
          <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
            {agreement.contract_number}
          </Typography>
        )}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ mt: 1 }}>
          <Stack direction="row" alignItems="center">
            <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
              Placeholders are filled from engagement / family / consultant
              data when the PDF is rendered. Edits are per-agreement and
              don't touch the source template.
            </Typography>
            <FormControlLabel
              sx={{ mr: 0 }}
              control={
                <Switch
                  size="small"
                  checked={sourceMode}
                  onChange={(e) => setSourceMode(e.target.checked)}
                  inputProps={{ "data-testid": "agreement-body-source-toggle" } as Record<string, string>}
                />
              }
              label={<Typography variant="caption">Markdown source</Typography>}
            />
          </Stack>
          {sourceMode ? (
            <TextField
              fullWidth
              multiline
              inputProps={{ "data-testid": "agreement-body-editor" } as Record<string, string>}
              minRows={20}
              maxRows={40}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              InputProps={{ sx: { fontFamily: "monospace", fontSize: 13 } }}
            />
          ) : (
            <ContractBodyEditor
              testId="agreement-body-rich-editor"
              value={body}
              onChange={setBody}
              knownVariables={uniqueVariables}
            />
          )}
          {uniqueVariables.length > 0 && (
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                Detected placeholders ({uniqueVariables.length})
              </Typography>
              <Stack direction="row" useFlexGap flexWrap="wrap" sx={{ gap: 0.5 }}>
                {uniqueVariables.map((v) => (
                  <Chip
                    key={v}
                    size="small"
                    label={v}
                    sx={{ fontFamily: "monospace", fontSize: 12 }}
                  />
                ))}
              </Stack>
            </Box>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={save.isPending}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={() => save.mutate()}
          disabled={save.isPending || body.trim().length === 0}
        >
          {save.isPending ? "Saving…" : "Save"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
