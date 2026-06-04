import { useState } from "react";
import {
  Autocomplete,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import LockIcon from "@mui/icons-material/Lock";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link as RouterLink } from "react-router-dom";

import { SectionPanel } from "../../components/SectionPanel";
import { useSnackbar } from "../../components/Snackbar";

interface Expense {
  id: string;
  engagement_id: string;
  user_id: string;
  user_name: string | null;
  expense_date: string;
  amount: string;
  category: string | null;
  description: string | null;
  billable: boolean;
  receipt_doc_id: string | null;
  invoice_id: string | null;
  invoice_number: string | null;
}

export function ExpensesCard({ engagementId }: { engagementId: string }) {
  const qc = useQueryClient();
  const snackbar = useSnackbar();
  const [addOpen, setAddOpen] = useState(false);

  const expenses = useQuery<Expense[], Error>({
    queryKey: ["engagements", engagementId, "expenses"],
    queryFn: async () => {
      const res = await fetch(`/api/engagements/${engagementId}/expenses`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load expenses.");
      return res.json();
    },
  });

  const categories = useQuery<string[], Error>({
    queryKey: ["expenses", "categories"],
    queryFn: async () => {
      const res = await fetch(`/api/expenses/categories`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load categories.");
      return res.json();
    },
  });

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["engagements", engagementId, "expenses"] });

  const patch = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Partial<Expense> }) => {
      const res = await fetch(`/api/expenses/${id}`, {
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

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/expenses/${id}`, {
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

  const rows = expenses.data ?? [];
  const total = rows.reduce((acc, r) => acc + Number(r.amount || 0), 0);
  const billable = rows
    .filter((r) => r.billable)
    .reduce((acc, r) => acc + Number(r.amount || 0), 0);

  return (
    <SectionPanel
      title="Expenses"
      titleVariant="overline"
      actions={
        <Stack direction="row" alignItems="center" spacing={1} sx={{ flexWrap: "wrap" }}>
          <Typography variant="caption" color="text.secondary">
            ${total.toFixed(2)} total · ${billable.toFixed(2)} billable
          </Typography>
          <Button size="small" startIcon={<AddIcon />} onClick={() => setAddOpen(true)}>
            Add expense
          </Button>
        </Stack>
      }
    >
      <Box sx={{ p: 2.5 }}>
        {expenses.isPending ? (
          <Typography variant="body2" color="text.disabled">Loading…</Typography>
        ) : rows.length === 0 ? (
          <Typography variant="body2" color="text.disabled">
            No expenses logged yet.
          </Typography>
        ) : (
          <Stack divider={<Box sx={{ borderTop: 1, borderColor: "divider" }} />}>
            {rows.map((r) => (
              <ExpenseRow
                key={r.id}
                expense={r}
                categoryOptions={categories.data ?? []}
                onPatch={(body) => patch.mutate({ id: r.id, body })}
                onDelete={() => remove.mutate(r.id)}
              />
            ))}
          </Stack>
        )}
      </Box>

      <AddExpenseDialog
        open={addOpen}
        engagementId={engagementId}
        categoryOptions={categories.data ?? []}
        onClose={() => setAddOpen(false)}
        onCreated={() => {
          setAddOpen(false);
          invalidate();
        }}
      />
    </SectionPanel>
  );
}

function ExpenseRow({
  expense,
  categoryOptions,
  onPatch,
  onDelete,
}: {
  expense: Expense;
  categoryOptions: string[];
  onPatch: (body: Partial<Expense>) => void;
  onDelete: () => void;
}) {
  const locked = expense.invoice_id !== null;
  return (
    <Stack
      direction={{ xs: "column", md: "row" }}
      spacing={1.5}
      alignItems={{ md: "center" }}
      sx={{
        py: 1.25,
        opacity: locked ? 0.7 : 1,
      }}
    >
      <Box sx={{ width: { md: 130 }, flexShrink: 0 }}>
        <TextField
          size="small"
          fullWidth
          type="date"
          disabled={locked}
          defaultValue={expense.expense_date}
          onBlur={(e) => {
            if (e.target.value !== expense.expense_date) {
              onPatch({ expense_date: e.target.value || null } as Partial<Expense>);
            }
          }}
        />
      </Box>
      <Box sx={{ width: { md: 90 }, flexShrink: 0 }}>
        <TextField
          size="small"
          fullWidth
          type="number"
          inputProps={{ step: "0.01", min: "0.01" }}
          disabled={locked}
          defaultValue={expense.amount}
          onBlur={(e) => {
            if (e.target.value !== expense.amount) {
              onPatch({ amount: e.target.value } as Partial<Expense>);
            }
          }}
        />
      </Box>
      <Box sx={{ width: { md: 160 }, flexShrink: 0 }}>
        <Autocomplete
          size="small"
          freeSolo
          disabled={locked}
          options={categoryOptions}
          value={expense.category ?? ""}
          onChange={(_e, v) => {
            const next = (v ?? "").trim() || null;
            if (next !== expense.category) {
              onPatch({ category: next } as Partial<Expense>);
            }
          }}
          renderInput={(params) => (
            <TextField {...params} placeholder="Category" />
          )}
        />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <TextField
          size="small"
          fullWidth
          placeholder="Description"
          disabled={locked}
          defaultValue={expense.description ?? ""}
          onBlur={(e) => {
            const next = e.target.value.trim() || null;
            if (next !== expense.description) {
              onPatch({ description: next } as Partial<Expense>);
            }
          }}
        />
      </Box>
      <Stack direction="row" spacing={0.5} alignItems="center">
        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={expense.billable}
              disabled={locked}
              onChange={(e) =>
                onPatch({ billable: e.target.checked } as Partial<Expense>)
              }
            />
          }
          label={
            <Typography variant="caption" color="text.secondary">
              Billable
            </Typography>
          }
          sx={{ mr: 0 }}
        />
        {locked && (
          <Tooltip title={`On invoice ${expense.invoice_number ?? expense.invoice_id}`}>
            <Chip
              component={RouterLink}
              to={`/invoices/${expense.invoice_id}`}
              clickable
              size="small"
              icon={<LockIcon fontSize="small" />}
              label={expense.invoice_number ?? "invoiced"}
              variant="outlined"
            />
          </Tooltip>
        )}
        {!locked && (
          <IconButton
            size="small"
            aria-label="Delete expense"
            onClick={onDelete}
            sx={{ color: "text.disabled", "&:hover": { color: "error.main" } }}
          >
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        )}
      </Stack>
    </Stack>
  );
}

function AddExpenseDialog({
  open,
  engagementId,
  categoryOptions,
  onClose,
  onCreated,
}: {
  open: boolean;
  engagementId: string;
  categoryOptions: string[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const snackbar = useSnackbar();
  const [expenseDate, setExpenseDate] = useState<string>(
    new Date().toISOString().slice(0, 10),
  );
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [billable, setBillable] = useState(true);

  const reset = () => {
    setExpenseDate(new Date().toISOString().slice(0, 10));
    setAmount("");
    setCategory("");
    setDescription("");
    setBillable(true);
  };

  const create = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/engagements/${engagementId}/expenses`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expense_date: expenseDate || null,
          amount,
          category: category.trim() || null,
          description: description.trim() || null,
          billable,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { detail?: string }).detail ?? "Create failed.");
      }
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
      <DialogTitle>Add expense</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
            <TextField
              label="Date"
              type="date"
              size="small"
              value={expenseDate}
              onChange={(e) => setExpenseDate(e.target.value)}
              sx={{ flex: 1 }}
            />
            <TextField
              label="Amount"
              type="number"
              inputProps={{ step: "0.01", min: "0.01" }}
              size="small"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
              sx={{ flex: 1 }}
            />
          </Stack>
          <Autocomplete
            freeSolo
            size="small"
            options={categoryOptions}
            value={category}
            onChange={(_e, v) => setCategory(v ?? "")}
            onInputChange={(_e, v) => setCategory(v)}
            renderInput={(params) => (
              <TextField {...params} label="Category" placeholder="Mileage, Application fee…" />
            )}
          />
          <TextField
            label="Description"
            placeholder="Optional"
            size="small"
            multiline
            minRows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <FormControlLabel
            control={
              <Switch
                checked={billable}
                onChange={(e) => setBillable(e.target.checked)}
                size="small"
              />
            }
            label="Billable"
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
          disabled={!amount || Number(amount) <= 0 || create.isPending}
        >
          {create.isPending ? "Adding…" : "Add"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
