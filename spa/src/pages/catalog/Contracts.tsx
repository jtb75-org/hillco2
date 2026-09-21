import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  MenuItem,
  Select,
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
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ContractBodyEditor } from "../../components/ContractBodyEditor";
import { DataTableContainer } from "../../components/DataTableContainer";
import { useSnackbar } from "../../components/Snackbar";
import { StatusChip } from "../../components/StatusChip";

type AgreementType = "services_contract" | "records_request" | "medical_release";

const TYPE_LABEL: Record<AgreementType, string> = {
  services_contract: "Services contract",
  records_request: "Records request",
  // Retired: the form isn't practical (every records holder needs its own
  // release). Kept so the retired template row still labels correctly.
  medical_release: "Medical records release",
};

interface ContractTemplate {
  id: string;
  kind: AgreementType;
  name: string;
  body_markdown: string;
  is_active: boolean;
  sort_order: number;
  variables: string[];
  created_at: string;
  updated_at: string;
}

export function CatalogContracts() {
  const qc = useQueryClient();
  const snackbar = useSnackbar();
  const [editing, setEditing] = useState<ContractTemplate | "new" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ContractTemplate | null>(null);

  const templates = useQuery<ContractTemplate[], Error>({
    queryKey: ["contract-templates", { includeInactive: true }],
    queryFn: async () => {
      const res = await fetch(
        "/api/contract-templates?include_inactive=true",
        { credentials: "include" },
      );
      if (!res.ok) throw new Error("Failed to load templates.");
      return res.json();
    },
  });

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["contract-templates"] });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/contract-templates/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok && res.status !== 204) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { detail?: string }).detail ?? "Delete failed.");
      }
    },
    onSuccess: () => {
      setConfirmDelete(null);
      invalidate();
      snackbar.show("Template deleted");
    },
    onError: (e: Error) => snackbar.show(e.message, "error"),
  });

  const rows = templates.data ?? [];
  // Every variable any template uses, for the editor's "Insert variable"
  // picker — so a new template can reuse the established names.
  const allVariables = useMemo(
    () => [...new Set(rows.flatMap((t) => t.variables))].sort(),
    [rows],
  );

  return (
    <Box>
      <Stack direction="row" alignItems="baseline" spacing={1} sx={{ mb: 2 }}>
        <Typography variant="h6" sx={{ flex: 1 }}>
          Templates
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setEditing("new")}
        >
          New template
        </Button>
      </Stack>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Template bodies are cloned into agreements at create time. Fill-in
        fields are inserted from the editor's <b>Insert variable</b> menu (or
        written as{" "}
        <Box component="code" sx={{ fontFamily: "monospace" }}>
          {`{{snake_case}}`}
        </Box>{" "}
        in markdown source); the system extracts them automatically.
      </Typography>

      <DataTableContainer
        loading={templates.isPending}
        loadingColumns={5}
        empty={rows.length === 0}
        emptyTitle="No templates yet"
        emptyDescription="Templates you create will appear here."
      >
        <Table size="small">
          <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Kind</TableCell>
                <TableCell>Variables</TableCell>
                <TableCell>Active</TableCell>
                <TableCell align="right" />
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((t) => (
                <TableRow
                  key={t.id}
                  data-testid={`contract-template-row-${t.id}`}
                  data-template-name={t.name}
                >
                  <TableCell>{t.name}</TableCell>
                  <TableCell>
                    <StatusChip size="small" tone="neutral" variant="soft" label={TYPE_LABEL[t.kind]} />
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" useFlexGap flexWrap="wrap" sx={{ gap: 0.5 }}>
                      {t.variables.length === 0 ? (
                        <Typography variant="caption" color="text.disabled">
                          none
                        </Typography>
                      ) : (
                        t.variables.map((v) => (
                          <Chip
                            key={v}
                            size="small"
                            label={v}
                            sx={{
                              height: 20,
                              fontFamily: "monospace",
                              fontSize: 11,
                            }}
                          />
                        ))
                      )}
                    </Stack>
                  </TableCell>
                  <TableCell>
                    {t.is_active ? (
                      <StatusChip size="small" tone="success" variant="soft" label="Active" />
                    ) : (
                      <StatusChip size="small" tone="neutral" variant="soft" label="Inactive" />
                    )}
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title="Edit">
                      <IconButton
                        size="small"
                        aria-label={`Edit ${t.name}`}
                        onClick={() => setEditing(t)}
                      >
                        <EditOutlinedIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete">
                      <IconButton
                        size="small"
                        aria-label={`Delete ${t.name}`}
                        onClick={() => setConfirmDelete(t)}
                        sx={{ color: "text.disabled", "&:hover": { color: "error.main" } }}
                      >
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
        </Table>
      </DataTableContainer>

      <TemplateDialog
        editing={editing}
        knownVariables={allVariables}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          invalidate();
        }}
      />

      <Dialog
        open={!!confirmDelete}
        onClose={() => !remove.isPending && setConfirmDelete(null)}
        maxWidth="xs"
      >
        <DialogTitle>Delete template?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            Soft-deletes "{confirmDelete?.name}". Existing agreements that used
            this template keep their snapshotted body intact.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDelete(null)} disabled={remove.isPending}>
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => confirmDelete && remove.mutate(confirmDelete.id)}
            disabled={remove.isPending}
          >
            {remove.isPending ? "Deleting…" : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

const VARIABLE_RE = /\{\{\s*([a-z][a-z0-9_]+)\s*\}\}/g;

function extractVariables(body: string): string[] {
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  const re = new RegExp(VARIABLE_RE);
  while ((m = re.exec(body))) seen.add(m[1]);
  return [...seen];
}

function TemplateDialog({
  editing,
  knownVariables,
  onClose,
  onSaved,
}: {
  editing: ContractTemplate | "new" | null;
  knownVariables: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const snackbar = useSnackbar();
  const isNew = editing === "new";
  const open = editing !== null;
  const initial = useMemo<ContractTemplate | null>(
    () => (editing && editing !== "new" ? editing : null),
    [editing],
  );
  const [name, setName] = useState("");
  const [kind, setKind] = useState<AgreementType>("services_contract");
  const [body, setBody] = useState("");
  const [isActive, setIsActive] = useState(true);
  // Rich editor by default; the raw markdown textarea stays available as an
  // escape hatch for anyone who prefers it (and for the e2e suite).
  const [sourceMode, setSourceMode] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? "");
    setKind(initial?.kind ?? "services_contract");
    setBody(initial?.body_markdown ?? "");
    setIsActive(initial?.is_active ?? true);
    setSourceMode(false);
  }, [open, initial]);

  const liveVariables = useMemo(() => extractVariables(body), [body]);
  // Picker offers everything in use across templates plus whatever this
  // body already references, so a just-typed new name is reusable at once.
  const pickerVariables = useMemo(
    () => [...new Set([...knownVariables, ...liveVariables])].sort(),
    [knownVariables, liveVariables],
  );

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        kind,
        name: name.trim(),
        body_markdown: body,
        is_active: isActive,
      };
      const res = await fetch(
        isNew ? "/api/contract-templates" : `/api/contract-templates/${initial!.id}`,
        {
          method: isNew ? "POST" : "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { detail?: string }).detail ?? "Save failed.");
      }
    },
    onSuccess: onSaved,
    onError: (e: Error) => snackbar.show(e.message, "error"),
  });

  return (
    <Dialog
      open={open}
      onClose={() => !save.isPending && onClose()}
      maxWidth="lg"
      fullWidth
    >
      <DialogTitle>{isNew ? "New template" : "Edit template"}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
            <TextField
              label="Name"
              size="small"
              value={name}
              onChange={(e) => setName(e.target.value)}
              sx={{ flex: 2 }}
              autoFocus
            />
            <Select
              data-testid="contract-template-kind-select"
              size="small"
              value={kind}
              onChange={(e) => setKind(e.target.value as AgreementType)}
              sx={{ flex: 1 }}
            >
              <MenuItem value="services_contract">Services contract</MenuItem>
              <MenuItem value="records_request">Records request</MenuItem>
              {kind === "medical_release" && (
                <MenuItem value="medical_release">Medical records release (retired)</MenuItem>
              )}
            </Select>
            <FormControlLabel
              control={
                <Switch
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                />
              }
              label="Active"
            />
          </Stack>
          <Box>
            <Stack direction="row" alignItems="center" sx={{ mb: 0.5 }}>
              <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
                {sourceMode
                  ? `Body (markdown source — use {{snake_case}} for variables)`
                  : "Body"}
              </Typography>
              <FormControlLabel
                sx={{ mr: 0 }}
                control={
                  <Switch
                    size="small"
                    checked={sourceMode}
                    onChange={(e) => setSourceMode(e.target.checked)}
                    inputProps={{ "data-testid": "contract-template-source-toggle" } as Record<string, string>}
                  />
                }
                label={<Typography variant="caption">Markdown source</Typography>}
              />
            </Stack>
            {sourceMode ? (
              <TextField
                fullWidth
                multiline
                inputProps={{ "data-testid": "contract-template-body-editor" } as Record<string, string>}
                minRows={20}
                maxRows={40}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                InputProps={{
                  sx: { fontFamily: "monospace", fontSize: 13 },
                }}
              />
            ) : (
              <ContractBodyEditor
                testId="contract-template-rich-editor"
                value={body}
                onChange={setBody}
                knownVariables={pickerVariables}
              />
            )}
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
              Detected variables ({liveVariables.length})
            </Typography>
            {liveVariables.length === 0 ? (
              <Alert severity="info">
                No variables detected. Use{" "}
                <Box component="code" sx={{ fontFamily: "monospace" }}>
                  {`{{variable_name}}`}
                </Box>{" "}
                to mark fillins.
              </Alert>
            ) : (
              <Stack direction="row" useFlexGap flexWrap="wrap" sx={{ gap: 0.5 }}>
                {liveVariables.map((v) => (
                  <Chip
                    key={v}
                    size="small"
                    data-testid="contract-template-variable-chip"
                    label={v}
                    sx={{ fontFamily: "monospace", fontSize: 12 }}
                  />
                ))}
              </Stack>
            )}
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={save.isPending}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={() => save.mutate()}
          disabled={save.isPending || !name.trim() || !body.trim()}
        >
          {save.isPending ? "Saving…" : "Save"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
