import { useRef, useState } from "react";
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
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import AttachFileIcon from "@mui/icons-material/AttachFile";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import HistoryIcon from "@mui/icons-material/History";
import SendOutlinedIcon from "@mui/icons-material/SendOutlined";
import dayjs from "dayjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

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
  created_at: string;
  updated_at: string;
  created_by_name?: string | null;
}

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

export function ContractCard({ engagementId }: { engagementId: string }) {
  const qc = useQueryClient();
  const snackbar = useSnackbar();
  const [addOpen, setAddOpen] = useState(false);
  const [historyFor, setHistoryFor] = useState<AgreementType | null>(null);

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
    <Paper variant="outlined" sx={{ p: 2.5 }}>
      <Stack direction="row" alignItems="baseline" spacing={1} sx={{ mb: 1.5 }}>
        <Typography variant="overline" color="text.secondary" sx={{ flex: 1 }}>
          Contracts
        </Typography>
        <Button size="small" startIcon={<AddIcon />} onClick={() => setAddOpen(true)}>
          New agreement
        </Button>
      </Stack>

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
                onUploadSigned={(file) => uploadSigned.mutate({ id: current.id, file })}
                onRemove={() => remove.mutate(current.id)}
                busy={markSent.isPending || uploadSigned.isPending || remove.isPending}
              />
            ) : (
              <Typography variant="body2" color="text.disabled" sx={{ ml: 0.5 }}>
                No {TYPE_LABEL[t].toLowerCase()} yet.
              </Typography>
            )}
          </Box>
        );
      })}

      <AddAgreementDialog
        open={addOpen}
        engagementId={engagementId}
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
    </Paper>
  );
}

function byCreatedDesc(a: Agreement, b: Agreement) {
  return b.created_at.localeCompare(a.created_at);
}

function AgreementRow({
  agreement,
  onMarkSent,
  onUploadSigned,
  onRemove,
  busy,
}: {
  agreement: Agreement;
  onMarkSent: () => void;
  onUploadSigned: (file: File) => void;
  onRemove: () => void;
  busy: boolean;
}) {
  const state = lifecycleOf(agreement);
  const fileRef = useRef<HTMLInputElement | null>(null);
  return (
    <Box
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
        {state === "drafted" && (
          <>
            <Button
              size="small"
              startIcon={<SendOutlinedIcon fontSize="small" />}
              onClick={onMarkSent}
              disabled={busy}
            >
              Mark sent
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
  existingTypes,
  onClose,
  onCreated,
}: {
  open: boolean;
  engagementId: string;
  existingTypes: Set<AgreementType>;
  onClose: () => void;
  onCreated: () => void;
}) {
  const snackbar = useSnackbar();
  const [type, setType] = useState<AgreementType>("services_contract");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const alreadyHasActive = existingTypes.has(type);

  const reset = () => {
    setType("services_contract");
    setAmount("");
    setNotes("");
  };

  const create = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/engagements/${engagementId}/agreements`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          amount: amount.trim() || null,
          notes: notes.trim() || null,
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
            size="small"
            value={type}
            onChange={(e) => setType(e.target.value as AgreementType)}
          >
            <MenuItem value="services_contract">Services contract</MenuItem>
            <MenuItem value="medical_release">Medical records release</MenuItem>
          </Select>
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
          disabled={create.isPending}
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
