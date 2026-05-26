import {
  Alert,
  Button,
  Grid,
  IconButton,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
} from "@mui/material";
import PictureAsPdfOutlinedIcon from "@mui/icons-material/PictureAsPdfOutlined";
import SearchIcon from "@mui/icons-material/Search";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { DataTableContainer } from "../../components/DataTableContainer";
import { MetricCard } from "../../components/MetricCard";
import { PageHeader } from "../../components/PageHeader";
import { InvoiceStatusChip } from "./InvoiceStatusChip";
import { useInvoicesList } from "./invoiceApi";
import {
  formatInvoiceDate,
  formatInvoiceMoney,
  isInvoiceOverdue,
} from "./invoiceFormatters";
import type { InvoiceListRow, InvoiceListStatus } from "./invoiceTypes";

const STATUS_TABS: Array<{ value: InvoiceListStatus; label: string }> = [
  { value: "open", label: "Open" },
  { value: "draft", label: "Draft" },
  { value: "paid", label: "Paid" },
  { value: "void", label: "Void" },
  { value: "all", label: "All" },
];

function parseStatus(value: string | null): InvoiceListStatus {
  return STATUS_TABS.some((tab) => tab.value === value)
    ? (value as InvoiceListStatus)
    : "open";
}

export function InvoicesList() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const status = parseStatus(params.get("status"));
  const q = params.get("q") ?? "";
  const issuedFrom = params.get("issued_from") ?? "";
  const issuedTo = params.get("issued_to") ?? "";
  const dueFrom = params.get("due_from") ?? "";
  const dueTo = params.get("due_to") ?? "";
  const due = params.get("due");
  const focus = params.get("focus");
  const [qDraft, setQDraft] = useState(q);

  useEffect(() => {
    setQDraft(q);
  }, [q]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      if (qDraft.trim() === q) return;
      updateParam("q", qDraft.trim() || null);
    }, 300);
    return () => window.clearTimeout(handle);
  }, [qDraft, q]);

  const invoices = useInvoicesList({
    status,
    q: q || null,
    issued_from: issuedFrom || null,
    issued_to: issuedTo || null,
    due_from: dueFrom || null,
    due_to: dueTo || null,
  });
  const rows = invoices.data?.invoices ?? [];
  const visibleRows = useMemo(
    () => filterInvoices(rows, due === "overdue"),
    [rows, due],
  );
  const hasFilters = Boolean(q || issuedFrom || issuedTo || dueFrom || dueTo || due);

  const updateParam = (key: string, value: string | null) => {
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (value) next.set(key, value);
      else next.delete(key);
      return next;
    }, { replace: true });
  };

  if (invoices.error) {
    return (
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" onClick={() => invoices.refetch()}>
            Retry
          </Button>
        }
      >
        Failed to load invoices: {invoices.error.message}
      </Alert>
    );
  }

  return (
    <Stack spacing={3}>
      <PageHeader
        title="Invoices"
        subtitle="Review invoice status, totals, and PDF previews."
      />

      <Grid container spacing={2}>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard
            label="Outstanding"
            value={formatInvoiceMoney(invoices.data?.totals.outstanding)}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard
            label="Invoiced"
            value={formatInvoiceMoney(invoices.data?.totals.invoiced)}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard
            label="Paid"
            value={formatInvoiceMoney(invoices.data?.totals.paid)}
            emphasis="muted"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard
            label="Uninvoiced"
            value={formatInvoiceMoney(invoices.data?.totals.uninvoiced)}
            emphasis={focus === "uninvoiced" ? "alert" : "default"}
          />
        </Grid>
      </Grid>

      <Stack spacing={1.5}>
        <Tabs
          value={status}
          onChange={(_e, value: InvoiceListStatus) => updateParam("status", value)}
          sx={{ borderBottom: 1, borderColor: "divider" }}
        >
          {STATUS_TABS.map((tab) => (
            <Tab key={tab.value} value={tab.value} label={tab.label} />
          ))}
        </Tabs>
        <Stack direction={{ xs: "column", lg: "row" }} spacing={1.5}>
          <TextField
            label="Household search"
            size="small"
            value={qDraft}
            onChange={(e) => setQDraft(e.target.value)}
            placeholder="Search household or invoice number"
            InputProps={{ startAdornment: <SearchIcon fontSize="small" sx={{ mr: 1 }} /> }}
            sx={{ width: { xs: "100%", lg: 360 } }}
          />
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
            <TextField
              label="Issued from"
              type="date"
              size="small"
              value={issuedFrom}
              onChange={(e) => updateParam("issued_from", e.target.value || null)}
              InputLabelProps={{ shrink: true }}
              sx={{ width: { xs: "100%", sm: 160 } }}
            />
            <TextField
              label="Issued to"
              type="date"
              size="small"
              value={issuedTo}
              onChange={(e) => updateParam("issued_to", e.target.value || null)}
              InputLabelProps={{ shrink: true }}
              sx={{ width: { xs: "100%", sm: 160 } }}
            />
          </Stack>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
            <TextField
              label="Due from"
              type="date"
              size="small"
              value={dueFrom}
              onChange={(e) => updateParam("due_from", e.target.value || null)}
              InputLabelProps={{ shrink: true }}
              sx={{ width: { xs: "100%", sm: 160 } }}
            />
            <TextField
              label="Due to"
              type="date"
              size="small"
              value={dueTo}
              onChange={(e) => updateParam("due_to", e.target.value || null)}
              InputLabelProps={{ shrink: true }}
              sx={{ width: { xs: "100%", sm: 160 } }}
            />
          </Stack>
        </Stack>
      </Stack>

      <DataTableContainer
        loading={invoices.isPending}
        loadingColumns={7}
        empty={visibleRows.length === 0}
        emptyTitle={hasFilters ? "No matching invoices" : "No invoices"}
        emptyDescription={
          hasFilters
            ? "Adjust the search or filter to see more invoices."
            : "Invoices in this status will appear here."
        }
      >
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell>Invoice</TableCell>
              <TableCell>Household</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Issued</TableCell>
              <TableCell>Due</TableCell>
              <TableCell align="right">Total</TableCell>
              <TableCell align="right">PDF</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {visibleRows.map((invoice) => (
              <TableRow
                key={invoice.id}
                hover
                sx={{ cursor: "pointer" }}
                onClick={() => navigate(`/invoices/${invoice.id}`)}
              >
                <TableCell sx={{ fontWeight: 650 }}>
                  {invoice.invoice_number}
                </TableCell>
                <TableCell>{invoice.household_name}</TableCell>
                <TableCell>
                  <InvoiceStatusChip
                    status={invoice.status}
                    dueDate={invoice.due_date}
                  />
                </TableCell>
                <TableCell>{formatInvoiceDate(invoice.issue_date)}</TableCell>
                <TableCell>{formatInvoiceDate(invoice.due_date)}</TableCell>
                <TableCell align="right" sx={{ fontWeight: 650 }}>
                  {formatInvoiceMoney(invoice.total)}
                </TableCell>
                <TableCell align="right">
                  <Tooltip title="Preview PDF">
                    <IconButton
                      component="a"
                      href={`/api/invoices/${invoice.id}/pdf`}
                      target="_blank"
                      rel="noreferrer"
                      size="small"
                      aria-label={`Preview PDF for ${invoice.invoice_number}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <PictureAsPdfOutlinedIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DataTableContainer>

      {focus === "uninvoiced" && (
        <DataTableContainer
          loading={invoices.isPending}
          loadingColumns={4}
          empty={(invoices.data?.summary.length ?? 0) === 0}
          emptyTitle="No uninvoiced engagement balances"
          emptyDescription="Engagements with unbilled time or expenses will appear here."
        >
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Household</TableCell>
                <TableCell align="right">Uninvoiced</TableCell>
                <TableCell align="right">Outstanding</TableCell>
                <TableCell align="right" />
              </TableRow>
            </TableHead>
            <TableBody>
              {invoices.data?.summary.map((row) => (
                <TableRow key={row.engagement_id} hover>
                  <TableCell>{row.household_name}</TableCell>
                  <TableCell align="right">
                    {formatInvoiceMoney(row.uninvoiced_total)}
                  </TableCell>
                  <TableCell align="right">
                    {formatInvoiceMoney(row.outstanding_balance)}
                  </TableCell>
                  <TableCell align="right">
                    <Button
                      size="small"
                      onClick={() => navigate(`/engagements/${row.engagement_id}`)}
                    >
                      Open engagement
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DataTableContainer>
      )}
    </Stack>
  );
}

function filterInvoices(
  rows: InvoiceListRow[],
  overdueOnly: boolean,
) {
  return rows.filter((row) => {
    if (overdueOnly && !isInvoiceOverdue(row.status, row.due_date)) return false;
    return true;
  });
}
