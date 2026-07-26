import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Divider,
  Link as MuiLink,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import PictureAsPdfOutlinedIcon from "@mui/icons-material/PictureAsPdfOutlined";
import dayjs from "dayjs";
import { Link as RouterLink, useNavigate } from "react-router-dom";

import { InvoiceStatusChip } from "../invoices/InvoiceStatusChip";
import {
  useCreateInvoice,
  useEngagementInvoices,
  useUninvoicedForEngagement,
} from "../invoices/invoiceApi";
import {
  formatInvoiceDate,
  formatInvoiceMoney,
} from "../invoices/invoiceFormatters";
import { SectionPanel } from "../../components/SectionPanel";
import { useSnackbar } from "../../components/Snackbar";

interface BillingCardProps {
  engagementId: string;
  defaultHourlyRate: string | null;
}

export function BillingCard({
  engagementId,
  defaultHourlyRate,
}: BillingCardProps) {
  const navigate = useNavigate();
  const snackbar = useSnackbar();
  const uninvoiced = useUninvoicedForEngagement(engagementId);
  const invoices = useEngagementInvoices(engagementId);
  const createInvoice = useCreateInvoice(engagementId);
  const [selectedTimeIds, setSelectedTimeIds] = useState<Set<string>>(new Set());
  const [selectedExpenseIds, setSelectedExpenseIds] = useState<Set<string>>(new Set());
  // Contract terms are net-30, so pre-fill issue (today) + 30 days. The
  // backend applies the same default when due_date is omitted; the
  // pre-fill just makes it visible and editable before creating.
  const [dueDate, setDueDate] = useState(() =>
    dayjs().add(30, "day").format("YYYY-MM-DD"),
  );
  const [notes, setNotes] = useState("");

  const timeRows = uninvoiced.data?.time_entries ?? [];
  const expenseRows = uninvoiced.data?.expenses ?? [];
  const timeIdsKey = timeRows.map((row) => row.id).join("|");
  const expenseIdsKey = expenseRows.map((row) => row.id).join("|");
  const selectedForTimeKey = useRef<string>("");
  const selectedForExpenseKey = useRef<string>("");

  useEffect(() => {
    if (selectedForTimeKey.current === timeIdsKey) return;
    selectedForTimeKey.current = timeIdsKey;
    setSelectedTimeIds(new Set(timeRows.map((row) => row.id)));
  }, [timeIdsKey, timeRows]);

  useEffect(() => {
    if (selectedForExpenseKey.current === expenseIdsKey) return;
    selectedForExpenseKey.current = expenseIdsKey;
    setSelectedExpenseIds(new Set(expenseRows.map((row) => row.id)));
  }, [expenseIdsKey, expenseRows]);

  const selectedTotal = useMemo(() => {
    const timeTotal = timeRows
      .filter((row) => selectedTimeIds.has(row.id))
      .reduce(
        (acc, row) =>
          acc +
          Number(row.hours || 0) *
            Number(row.hourly_rate ?? defaultHourlyRate ?? 0),
        0,
      );
    const expenseTotal = expenseRows
      .filter((row) => selectedExpenseIds.has(row.id))
      .reduce((acc, row) => acc + Number(row.amount || 0), 0);
    return timeTotal + expenseTotal;
  }, [defaultHourlyRate, expenseRows, selectedExpenseIds, selectedTimeIds, timeRows]);

  const selectedCount = selectedTimeIds.size + selectedExpenseIds.size;
  const hasUninvoiced = timeRows.length + expenseRows.length > 0;
  const canCreate = selectedCount > 0 && !createInvoice.isPending;

  const toggleTime = (id: string) => {
    setSelectedTimeIds((prev) => toggled(prev, id));
  };
  const toggleExpense = (id: string) => {
    setSelectedExpenseIds((prev) => toggled(prev, id));
  };

  const handleCreate = () => {
    createInvoice.mutate(
      {
        due_date: dueDate || null,
        notes: notes.trim() || null,
        tax: "0",
        time_entry_ids: Array.from(selectedTimeIds),
        expense_ids: Array.from(selectedExpenseIds),
      },
      {
        onSuccess: (invoice) => {
          snackbar.show(`Draft ${invoice.invoice_number} created`);
          navigate(`/invoices/${invoice.id}`);
        },
        onError: (error: Error) => snackbar.show(error.message, "error"),
      },
    );
  };

  return (
    <SectionPanel
      title="Billing"
      titleVariant="overline"
      actions={
        <Typography variant="caption" color="text.secondary">
          {formatInvoiceMoney(selectedTotal)} selected
        </Typography>
      }
    >
      <Stack spacing={2} sx={{ p: 2.5 }}>
        {uninvoiced.error && (
          <Alert
            severity="error"
            action={
              <Button color="inherit" size="small" onClick={() => uninvoiced.refetch()}>
                Retry
              </Button>
            }
          >
            Failed to load uninvoiced work: {uninvoiced.error.message}
          </Alert>
        )}

        {invoices.error && (
          <Alert
            severity="error"
            action={
              <Button color="inherit" size="small" onClick={() => invoices.refetch()}>
                Retry
              </Button>
            }
          >
            Failed to load engagement invoices: {invoices.error.message}
          </Alert>
        )}

        <ExistingInvoicesTable
          loading={invoices.isPending}
          rows={invoices.data?.invoices ?? []}
        />

        <Divider />

        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={1.5}
          alignItems={{ md: "center" }}
        >
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle2">Create draft invoice</Typography>
            <Typography variant="caption" color="text.secondary">
              Select billable uninvoiced time and expenses for this engagement.
            </Typography>
          </Box>
          <TextField
            label="Due date"
            type="date"
            size="small"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ width: { md: 170 } }}
          />
        </Stack>

        {!uninvoiced.isPending && !hasUninvoiced ? (
          <Typography variant="body2" color="text.disabled">
            No billable uninvoiced time or expenses.
          </Typography>
        ) : (
          <Stack spacing={2}>
            <SourceTable
              title="Time"
              loading={uninvoiced.isPending}
              emptyTitle="No uninvoiced time"
              rows={timeRows.map((row) => {
                const rate = row.hourly_rate ?? defaultHourlyRate;
                const missingRate = rate === null || rate === "";
                return {
                  id: row.id,
                  date: row.work_date,
                  description: row.description || "Time entry",
                  meta: missingRate
                    ? `${Number(row.hours).toFixed(2)}h · no rate`
                    : `${Number(row.hours).toFixed(2)}h · ${formatInvoiceMoney(rate)}/hr`,
                  amount: Number(row.hours || 0) * Number(rate ?? 0),
                  selected: selectedTimeIds.has(row.id),
                };
              })}
              onToggle={toggleTime}
            />
            <SourceTable
              title="Expenses"
              loading={uninvoiced.isPending}
              emptyTitle="No uninvoiced expenses"
              rows={expenseRows.map((row) => ({
                id: row.id,
                date: row.expense_date,
                description: [row.category, row.description].filter(Boolean).join(" · ") || "Expense",
                meta: row.user_name ?? "",
                amount: Number(row.amount || 0),
                selected: selectedExpenseIds.has(row.id),
              }))}
              onToggle={toggleExpense}
            />
          </Stack>
        )}

        <Stack spacing={1.5}>
          <TextField
            label="Notes"
            size="small"
            multiline
            minRows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <Stack direction="row" justifyContent="flex-end" spacing={1}>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              disabled={!canCreate}
              onClick={handleCreate}
            >
              {createInvoice.isPending ? "Creating…" : "Create draft"}
            </Button>
          </Stack>
        </Stack>
      </Stack>
    </SectionPanel>
  );
}

function ExistingInvoicesTable({
  loading,
  rows,
}: {
  loading: boolean;
  rows: Array<{
    id: string;
    invoice_number: string;
    status: "draft" | "sent" | "paid" | "overdue" | "void";
    due_date: string | null;
    total: string;
  }>;
}) {
  if (loading) {
    return (
      <Box sx={{ overflowX: "auto" }}>
        <Table size="small">
          <TableBody>
            {Array.from({ length: 2 }).map((_, index) => (
              <TableRow key={index}>
                {Array.from({ length: 5 }).map((__, cellIndex) => (
                  <TableCell key={cellIndex}>
                    <Skeleton width="80%" />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>
    );
  }
  if (rows.length === 0) {
    return (
      <Typography variant="body2" color="text.disabled">
        No invoices yet for this engagement.
      </Typography>
    );
  }
  return (
    <Box sx={{ overflowX: "auto" }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Invoice</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Due</TableCell>
            <TableCell align="right">Total</TableCell>
            <TableCell align="right">PDF</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id} hover>
              <TableCell sx={{ fontWeight: 650 }}>
                <MuiLink component={RouterLink} to={`/invoices/${row.id}`} underline="hover">
                  {row.invoice_number}
                </MuiLink>
              </TableCell>
              <TableCell>
                <InvoiceStatusChip status={row.status} dueDate={row.due_date} />
              </TableCell>
              <TableCell>{formatInvoiceDate(row.due_date)}</TableCell>
              <TableCell align="right">{formatInvoiceMoney(row.total)}</TableCell>
              <TableCell align="right">
                <Button
                  component="a"
                  href={`/api/invoices/${row.id}/pdf`}
                  target="_blank"
                  rel="noreferrer"
                  size="small"
                  startIcon={<PictureAsPdfOutlinedIcon fontSize="small" />}
                >
                  PDF
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}

interface SourceRow {
  id: string;
  date: string;
  description: string;
  meta: string;
  amount: number;
  selected: boolean;
}

function SourceTable({
  title,
  loading,
  emptyTitle,
  rows,
  onToggle,
}: {
  title: string;
  loading: boolean;
  emptyTitle: string;
  rows: SourceRow[];
  onToggle: (id: string) => void;
}) {
  return (
    <Box>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
        <Typography variant="subtitle2">{title}</Typography>
        <Chip size="small" variant="outlined" label={rows.length} />
      </Stack>
      {loading ? (
        <Box sx={{ overflowX: "auto" }}>
          <Table size="small">
            <TableBody>
              {Array.from({ length: 2 }).map((_, index) => (
                <TableRow key={index}>
                  {Array.from({ length: 4 }).map((__, cellIndex) => (
                    <TableCell key={cellIndex}>
                      <Skeleton width="80%" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      ) : rows.length === 0 ? (
        <Typography variant="body2" color="text.disabled">
          {emptyTitle}
        </Typography>
      ) : (
        <Box sx={{ overflowX: "auto" }}>
          <Table size="small">
            <TableBody>
              {rows.map((row) => (
                <TableRow
                  key={row.id}
                  hover
                  sx={{ cursor: "pointer" }}
                  onClick={() => onToggle(row.id)}
                >
                  <TableCell padding="checkbox">
                    <Checkbox
                      checked={row.selected}
                      onChange={() => onToggle(row.id)}
                      onClick={(e) => e.stopPropagation()}
                      inputProps={{ "aria-label": `Select ${row.description}` }}
                    />
                  </TableCell>
                  <TableCell sx={{ width: 120 }}>
                    {dayjs(row.date).format("MMM D")}
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{row.description}</Typography>
                    {row.meta && (
                      <Typography variant="caption" color="text.secondary">
                        {row.meta}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 650 }}>
                    {formatInvoiceMoney(row.amount)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}
    </Box>
  );
}

function toggled(set: Set<string>, id: string) {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}
