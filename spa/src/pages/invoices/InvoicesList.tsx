import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  Link as MuiLink,
  CircularProgress,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import PictureAsPdfOutlinedIcon from "@mui/icons-material/PictureAsPdfOutlined";
import SearchIcon from "@mui/icons-material/Search";
import ViewKanbanIcon from "@mui/icons-material/ViewKanban";
import ViewListIcon from "@mui/icons-material/ViewList";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { DataTableContainer } from "../../components/DataTableContainer";
import { MetricCard } from "../../components/MetricCard";
import { PageHeader } from "../../components/PageHeader";
import { useSnackbar } from "../../components/Snackbar";
import { InvoiceStatusChip } from "./InvoiceStatusChip";
import {
  NothingLeftToInvoiceError,
  useCreateInvoiceFromUninvoiced,
  useInvoicesList,
} from "./invoiceApi";
import {
  formatInvoiceDate,
  formatInvoiceMoney,
  isInvoiceOverdue,
} from "./invoiceFormatters";
import type { InvoiceListRow, InvoiceListStatus, InvoiceSummaryRow } from "./invoiceTypes";

const STATUS_TABS: Array<{ value: InvoiceListStatus; label: string }> = [
  { value: "draft", label: "Draft" },
  { value: "open", label: "Open" },
  { value: "paid", label: "Paid" },
  { value: "void", label: "Void" },
  { value: "all", label: "All" },
];

type ViewMode = "list" | "kanban";

const KANBAN_COLUMNS: Array<{ value: Exclude<InvoiceListStatus, "all">; label: string }> = [
  { value: "draft", label: "Draft" },
  { value: "open", label: "Open" },
  { value: "paid", label: "Paid" },
  { value: "void", label: "Void" },
];

function parseStatus(value: string | null): InvoiceListStatus {
  return STATUS_TABS.some((tab) => tab.value === value)
    ? (value as InvoiceListStatus)
    : "open";
}

function parseView(value: string | null): ViewMode {
  return value === "kanban" ? "kanban" : "list";
}

function formatTabLabel(label: string, count: number | undefined) {
  return count === undefined ? label : `${label} (${count})`;
}

export function InvoicesList() {
  const navigate = useNavigate();
  const snackbar = useSnackbar();
  const [params, setParams] = useSearchParams();
  const status = parseStatus(params.get("status"));
  const view = parseView(params.get("view"));
  const q = params.get("q") ?? "";
  const issuedFrom = params.get("issued_from") ?? "";
  const issuedTo = params.get("issued_to") ?? "";
  const dueFrom = params.get("due_from") ?? "";
  const dueTo = params.get("due_to") ?? "";
  const due = params.get("due");
  const focus = params.get("focus");
  const [qDraft, setQDraft] = useState(q);
  const [newInvoiceOpen, setNewInvoiceOpen] = useState(false);

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
    status: view === "kanban" ? "all" : status,
    q: q || null,
    issued_from: issuedFrom || null,
    issued_to: issuedTo || null,
    due_from: dueFrom || null,
    due_to: dueTo || null,
  });
  const rows = invoices.data?.invoices ?? [];
  const summaryRows = useMemo(
    () => (invoices.data?.summary ?? []).filter((row) => Number(row.uninvoiced_total) > 0),
    [invoices.data?.summary],
  );
  const createInvoice = useCreateInvoiceFromUninvoiced();
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

  const handleCreateInvoice = (engagementId: string) => {
    createInvoice.mutate(engagementId, {
      onSuccess: (invoice) => {
        setNewInvoiceOpen(false);
        snackbar.show(`Draft ${invoice.invoice_number} created`);
        navigate(`/invoices/${invoice.id}`);
      },
      onError: (error: Error) => {
        if (error instanceof NothingLeftToInvoiceError) {
          snackbar.show(error.message, "error");
          invoices.refetch();
          return;
        }
        snackbar.show(error.message, "error");
      },
    });
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
        actions={
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setNewInvoiceOpen(true)}
          >
            New invoice
          </Button>
        }
      />

      <NewInvoiceDialog
        open={newInvoiceOpen}
        loading={invoices.isPending}
        rows={summaryRows}
        creatingEngagementId={createInvoice.isPending ? createInvoice.variables : undefined}
        onClose={() => setNewInvoiceOpen(false)}
        onOpenEngagement={(engagementId) => {
          setNewInvoiceOpen(false);
          navigate(`/engagements/${engagementId}`);
        }}
        onCreateInvoice={handleCreateInvoice}
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
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1.5}
          alignItems={{ sm: "center" }}
          justifyContent="space-between"
        >
          {view === "list" ? (
            <Tabs
              value={status}
              onChange={(_e, value: InvoiceListStatus) => updateParam("status", value)}
              sx={{ borderBottom: 1, borderColor: "divider", flex: 1 }}
            >
              {STATUS_TABS.map((tab) => (
                <Tab
                  key={tab.value}
                  value={tab.value}
                  label={formatTabLabel(tab.label, invoices.data?.status_counts?.[tab.value])}
                />
              ))}
            </Tabs>
          ) : (
            <Box sx={{ flex: 1 }} />
          )}
          <ViewPill view={view} onChange={(next) => updateParam("view", next === "list" ? null : next)} />
        </Stack>
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

      {view === "list" ? (
        <>
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
            <InvoiceListTable
              rows={visibleRows}
              onOpenInvoice={(invoiceId) => navigate(`/invoices/${invoiceId}`)}
            />
          </DataTableContainer>

          {focus === "uninvoiced" && (
            <DataTableContainer
              loading={invoices.isPending}
              loadingColumns={5}
              empty={summaryRows.length === 0}
              emptyTitle="No uninvoiced engagement balances"
              emptyDescription="Engagements with unbilled time or expenses will appear here."
            >
              <InvoiceSummaryTable
                rows={summaryRows}
                creatingEngagementId={createInvoice.isPending ? createInvoice.variables : undefined}
                onCreateInvoice={handleCreateInvoice}
                onOpenEngagement={(engagementId) => navigate(`/engagements/${engagementId}`)}
              />
            </DataTableContainer>
          )}
        </>
      ) : (
        <InvoiceKanbanView
          rows={visibleRows}
          counts={invoices.data?.status_counts}
          loading={invoices.isPending}
          onOpenInvoice={(invoiceId) => navigate(`/invoices/${invoiceId}`)}
        />
      )}
    </Stack>
  );
}

function ViewPill({
  view,
  onChange,
}: {
  view: ViewMode;
  onChange: (next: ViewMode) => void;
}) {
  return (
    <ToggleButtonGroup
      value={view}
      exclusive
      onChange={(_, value) => value && onChange(value as ViewMode)}
      size="small"
      sx={{
        bgcolor: "action.hover",
        borderRadius: 999,
        p: 0.25,
        "& .MuiToggleButton-root": {
          px: 2.25,
          py: 0.5,
          border: 0,
          borderRadius: 999,
          textTransform: "none",
          color: "text.secondary",
          fontWeight: 500,
          "&:not(:first-of-type)": { marginLeft: 0 },
        },
        "& .MuiToggleButton-root.Mui-selected": {
          bgcolor: "background.paper",
          color: "text.primary",
          boxShadow: 1,
          "&:hover": { bgcolor: "background.paper" },
        },
      }}
    >
      <Tooltip title="List">
        <ToggleButton value="list" aria-label="List" disableRipple>
          <ViewListIcon fontSize="small" />
        </ToggleButton>
      </Tooltip>
      <Tooltip title="Kanban">
        <ToggleButton value="kanban" aria-label="Kanban" disableRipple>
          <ViewKanbanIcon fontSize="small" />
        </ToggleButton>
      </Tooltip>
    </ToggleButtonGroup>
  );
}

function InvoiceListTable({
  rows,
  onOpenInvoice,
}: {
  rows: InvoiceListRow[];
  onOpenInvoice: (invoiceId: string) => void;
}) {
  return (
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
        {rows.map((invoice) => (
          <TableRow
            key={invoice.id}
            hover
            sx={{ cursor: "pointer" }}
            onClick={() => onOpenInvoice(invoice.id)}
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
  );
}

function InvoiceKanbanView({
  rows,
  counts,
  loading,
  onOpenInvoice,
}: {
  rows: InvoiceListRow[];
  counts: Record<InvoiceListStatus, number> | undefined;
  loading: boolean;
  onOpenInvoice: (invoiceId: string) => void;
}) {
  const grouped = useMemo(() => groupInvoicesForKanban(rows), [rows]);
  if (loading) {
    return (
      <Grid container spacing={2}>
        {KANBAN_COLUMNS.map((column) => (
          <Grid key={column.value} item xs={12} md={6} xl={3}>
            <DataTableContainer loading loadingColumns={1} loadingRows={4}>
              <></>
            </DataTableContainer>
          </Grid>
        ))}
      </Grid>
    );
  }

  return (
    <Grid container spacing={2}>
      {KANBAN_COLUMNS.map((column) => {
        const columnRows = grouped[column.value];
        return (
          <Grid key={column.value} item xs={12} md={6} xl={3}>
            <Box
              sx={{
                border: 1,
                borderColor: "divider",
                bgcolor: "background.paper",
                minHeight: 360,
              }}
            >
              <Stack
                direction="row"
                alignItems="center"
                justifyContent="space-between"
                sx={{ px: 1.5, py: 1.25, borderBottom: 1, borderColor: "divider" }}
              >
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                  {formatTabLabel(column.label, counts?.[column.value])}
                </Typography>
                <Chip size="small" variant="outlined" label={columnRows.length} />
              </Stack>
              <Stack spacing={1.25} sx={{ p: 1.25 }}>
                {columnRows.length === 0 ? (
                  <Typography variant="body2" color="text.disabled" sx={{ p: 1 }}>
                    No invoices in {column.label}.
                  </Typography>
                ) : (
                  columnRows.map((invoice) => (
                    <InvoiceKanbanCard
                      key={invoice.id}
                      invoice={invoice}
                      onOpen={() => onOpenInvoice(invoice.id)}
                    />
                  ))
                )}
              </Stack>
            </Box>
          </Grid>
        );
      })}
    </Grid>
  );
}

function InvoiceKanbanCard({
  invoice,
  onOpen,
}: {
  invoice: InvoiceListRow;
  onOpen: () => void;
}) {
  const overdue = isInvoiceOverdue(invoice.status, invoice.due_date);
  return (
    <Card
      variant="outlined"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") onOpen();
      }}
      sx={{
        cursor: "pointer",
        outline: "none",
        "&:focus-visible": {
          boxShadow: (theme) => `0 0 0 2px ${theme.palette.primary.main}`,
        },
      }}
    >
      <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
        <Stack spacing={1}>
          <Stack direction="row" spacing={1} alignItems="flex-start">
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                {invoice.invoice_number}
              </Typography>
              <Typography variant="body2" color="text.secondary" noWrap>
                {invoice.household_name}
              </Typography>
            </Box>
            <Tooltip title="Preview PDF">
              <IconButton
                component="a"
                href={`/api/invoices/${invoice.id}/pdf`}
                target="_blank"
                rel="noreferrer"
                size="small"
                aria-label={`Preview PDF for ${invoice.invoice_number}`}
                onClick={(event) => event.stopPropagation()}
              >
                <PictureAsPdfOutlinedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <InvoiceStatusChip status={invoice.status} dueDate={invoice.due_date} />
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              {formatInvoiceMoney(invoice.total)}
            </Typography>
          </Stack>
          <Typography
            variant="caption"
            color={overdue ? "error.main" : "text.secondary"}
          >
            Due {formatInvoiceDate(invoice.due_date)}
          </Typography>
        </Stack>
      </CardContent>
    </Card>
  );
}

function groupInvoicesForKanban(rows: InvoiceListRow[]) {
  const grouped: Record<Exclude<InvoiceListStatus, "all">, InvoiceListRow[]> = {
    draft: [],
    open: [],
    paid: [],
    void: [],
  };
  rows.forEach((row) => {
    if (row.status === "draft") grouped.draft.push(row);
    else if (row.status === "paid") grouped.paid.push(row);
    else if (row.status === "void") grouped.void.push(row);
    else grouped.open.push(row);
  });
  return grouped;
}

function NewInvoiceDialog({
  open,
  loading,
  rows,
  creatingEngagementId,
  onClose,
  onOpenEngagement,
  onCreateInvoice,
}: {
  open: boolean;
  loading: boolean;
  rows: InvoiceSummaryRow[];
  creatingEngagementId: string | undefined;
  onClose: () => void;
  onOpenEngagement: (engagementId: string) => void;
  onCreateInvoice: (engagementId: string) => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Start a new invoice</DialogTitle>
      <DialogContent>
        <DataTableContainer
          loading={loading}
          loadingColumns={5}
          loadingRows={4}
          empty={rows.length === 0}
          emptyTitle="All engagements are caught up"
          emptyDescription="No uninvoiced time or expenses."
          emptyAction={
            <Button component={Link} to="/engagements" onClick={onClose}>
              View engagements
            </Button>
          }
        >
          <InvoiceSummaryTable
            rows={rows}
            creatingEngagementId={creatingEngagementId}
            onCreateInvoice={onCreateInvoice}
            onOpenEngagement={onOpenEngagement}
          />
        </DataTableContainer>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

function InvoiceSummaryTable({
  rows,
  creatingEngagementId,
  onCreateInvoice,
  onOpenEngagement,
}: {
  rows: InvoiceSummaryRow[];
  creatingEngagementId: string | undefined;
  onCreateInvoice: (engagementId: string) => void;
  onOpenEngagement: (engagementId: string) => void;
}) {
  return (
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
        {rows.map((row) => {
          const creating = creatingEngagementId === row.engagement_id;
          const anyCreating = !!creatingEngagementId;
          return (
            <TableRow key={row.engagement_id} hover>
              <TableCell>
                <MuiLink
                  component="button"
                  type="button"
                  underline="hover"
                  sx={{ fontWeight: 650 }}
                  onClick={() => onOpenEngagement(row.engagement_id)}
                >
                  {row.household_name}
                </MuiLink>
              </TableCell>
              <TableCell align="right" sx={{ fontWeight: 650 }}>
                {formatInvoiceMoney(row.uninvoiced_total)}
              </TableCell>
              <TableCell align="right">
                {formatInvoiceMoney(row.outstanding_balance)}
              </TableCell>
              <TableCell align="right">
                <Stack direction="row" spacing={1} justifyContent="flex-end">
                  <Button
                    size="small"
                    variant="contained"
                    disabled={anyCreating}
                    onClick={() => onCreateInvoice(row.engagement_id)}
                    startIcon={creating ? <CircularProgress size={14} /> : undefined}
                  >
                    Create invoice
                  </Button>
                  <Button
                    size="small"
                    disabled={anyCreating}
                    onClick={() => onOpenEngagement(row.engagement_id)}
                  >
                    Open engagement
                  </Button>
                </Stack>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
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
