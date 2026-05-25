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
  Grid,
  IconButton,
  Link as MuiLink,
  Paper,
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
import BlockOutlinedIcon from "@mui/icons-material/BlockOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import PaidOutlinedIcon from "@mui/icons-material/PaidOutlined";
import PictureAsPdfOutlinedIcon from "@mui/icons-material/PictureAsPdfOutlined";
import SendOutlinedIcon from "@mui/icons-material/SendOutlined";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import dayjs from "dayjs";

import { ConfirmDialog } from "../../components/ConfirmDialog";
import { DataTableContainer } from "../../components/DataTableContainer";
import { PageHeader } from "../../components/PageHeader";
import { useSnackbar } from "../../components/Snackbar";
import { InvoiceStatusChip } from "./InvoiceStatusChip";
import {
  useAddCustomLineItem,
  useDeleteInvoice,
  useDeleteLineItem,
  useInvoice,
  useMarkPaidInvoice,
  usePatchInvoice,
  useSendInvoice,
  useVoidInvoice,
} from "./invoiceApi";
import {
  formatInvoiceDate,
  formatInvoiceMoney,
  sourceTypeLabel,
} from "./invoiceFormatters";
import type {
  CustomLineItemBody,
  InvoiceDetail as InvoiceDetailData,
  InvoiceDraftUpdateBody,
} from "./invoiceTypes";

export function InvoiceDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const snackbar = useSnackbar();
  const [confirmSend, setConfirmSend] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [addLineOpen, setAddLineOpen] = useState(false);
  const [markPaidOpen, setMarkPaidOpen] = useState(false);
  const [confirmVoid, setConfirmVoid] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const invoice = useInvoice(id);
  const data = invoice.data;
  const sendInvoice = useSendInvoice(id ?? "", data?.engagement_id);
  const patchInvoice = usePatchInvoice(id ?? "", data?.engagement_id);
  const addCustomLine = useAddCustomLineItem(id ?? "", data?.engagement_id);
  const deleteLine = useDeleteLineItem(id ?? "", data?.engagement_id);
  const markPaid = useMarkPaidInvoice(id ?? "", data?.engagement_id);
  const voidInvoice = useVoidInvoice(id ?? "", data?.engagement_id);
  const deleteInvoice = useDeleteInvoice(id ?? "", data?.engagement_id);

  const handleSend = () => {
    sendInvoice.mutate(undefined, {
      onSuccess: () => {
        setConfirmSend(false);
        snackbar.show("Invoice marked sent");
      },
      onError: (error: Error) => snackbar.show(error.message, "error"),
    });
  };
  const handleVoid = () => {
    voidInvoice.mutate(undefined, {
      onSuccess: () => {
        setConfirmVoid(false);
        snackbar.show("Invoice voided");
      },
      onError: (error: Error) => snackbar.show(error.message, "error"),
    });
  };
  const handleDelete = () => {
    deleteInvoice.mutate(undefined, {
      onSuccess: () => {
        setConfirmDelete(false);
        snackbar.show("Invoice deleted");
        navigate("/invoices");
      },
      onError: (error: Error) => snackbar.show(error.message, "error"),
    });
  };

  const isDraft = data?.status === "draft";
  const isSent = data?.status === "sent";

  if (invoice.error) {
    return (
      <Alert severity="error">
        Failed to load invoice: {invoice.error.message}
      </Alert>
    );
  }

  return (
    <Stack spacing={3}>
      <PageHeader
        title={data?.invoice_number ?? "Invoice"}
        subtitle={
          data ? (
            <>
              {data.family.household_name} ·{" "}
              <MuiLink component={Link} to={`/engagements/${data.engagement_id}`}>
                Engagement
              </MuiLink>
            </>
          ) : (
            "Loading invoice details..."
          )
        }
        breadcrumbs={
          <MuiLink component={Link} to="/invoices" underline="hover">
            Invoices
          </MuiLink>
        }
        actions={
          data && (
            <Stack direction="row" spacing={1} alignItems="center">
              <InvoiceStatusChip status={data.status} dueDate={data.due_date} />
              {isDraft && (
                <Button
                  variant="outlined"
                  startIcon={<EditOutlinedIcon />}
                  onClick={() => setEditOpen(true)}
                >
                  Edit
                </Button>
              )}
              {isDraft && (
                <Button
                  variant="contained"
                  startIcon={<SendOutlinedIcon />}
                  onClick={() => setConfirmSend(true)}
                >
                  Send
                </Button>
              )}
              {isSent && (
                <Button
                  variant="contained"
                  startIcon={<PaidOutlinedIcon />}
                  onClick={() => setMarkPaidOpen(true)}
                >
                  Mark paid
                </Button>
              )}
              {(isDraft || isSent) && (
                <Button
                  variant="outlined"
                  color="warning"
                  startIcon={<BlockOutlinedIcon />}
                  onClick={() => setConfirmVoid(true)}
                >
                  Void
                </Button>
              )}
              {isDraft && (
                <Button
                  variant="outlined"
                  color="error"
                  startIcon={<DeleteOutlineIcon />}
                  onClick={() => setConfirmDelete(true)}
                >
                  Delete
                </Button>
              )}
              <Button
                component="a"
                href={`/api/invoices/${data.id}/pdf`}
                target="_blank"
                rel="noreferrer"
                variant="outlined"
                startIcon={<PictureAsPdfOutlinedIcon />}
              >
                Preview PDF
              </Button>
            </Stack>
          )
        }
      />

      {invoice.isPending || !data ? (
        <DataTableContainer loading loadingColumns={5}>
          <></>
        </DataTableContainer>
      ) : (
        <>
          <Grid container spacing={2}>
            <Grid item xs={12} md={7}>
              <Paper variant="outlined" sx={{ p: 2.5, height: "100%" }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 650, mb: 2 }}>
                  Invoice details
                </Typography>
                <Grid container spacing={2}>
                  <DetailItem label="Household" value={data.family.household_name} />
                  <DetailItem label="Issued" value={formatInvoiceDate(data.issue_date)} />
                  <DetailItem label="Due" value={formatInvoiceDate(data.due_date)} />
                  <DetailItem label="Sent" value={formatInvoiceDate(data.sent_at)} />
                  <DetailItem label="Paid" value={formatInvoiceDate(data.paid_date)} />
                  <DetailItem label="Engagement" value={data.engagement_id.slice(0, 8)} />
                </Grid>
              </Paper>
            </Grid>
            <Grid item xs={12} md={5}>
              <Paper variant="outlined" sx={{ p: 2.5, height: "100%" }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 650, mb: 2 }}>
                  Totals
                </Typography>
                <Stack spacing={1}>
                  <TotalRow label="Subtotal" value={formatInvoiceMoney(data.subtotal)} />
                  <TotalRow label="Tax" value={formatInvoiceMoney(data.tax)} />
                  <Divider />
                  <TotalRow
                    label="Total"
                    value={formatInvoiceMoney(data.total)}
                    strong
                  />
                  {data.paid_amount && (
                    <TotalRow
                      label="Paid"
                      value={formatInvoiceMoney(data.paid_amount)}
                    />
                  )}
                </Stack>
              </Paper>
            </Grid>
          </Grid>

          <DataTableContainer
            empty={data.line_items.length === 0}
            emptyTitle="No line items"
          >
            <>
              {isDraft && (
                <Stack direction="row" justifyContent="flex-end" sx={{ p: 1.5, pb: 0 }}>
                  <Button
                    size="small"
                    startIcon={<AddIcon />}
                    onClick={() => setAddLineOpen(true)}
                  >
                    Add custom line
                  </Button>
                </Stack>
              )}
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Description</TableCell>
                    <TableCell>Source</TableCell>
                    <TableCell align="right">Quantity</TableCell>
                    <TableCell align="right">Rate</TableCell>
                    <TableCell align="right">Line total</TableCell>
                    {isDraft && <TableCell align="right" />}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.line_items.map((line) => (
                    <TableRow key={line.id}>
                      <TableCell sx={{ maxWidth: 520 }}>{line.description}</TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          variant="outlined"
                          label={sourceTypeLabel(line.source_type)}
                        />
                      </TableCell>
                      <TableCell align="right">{Number(line.quantity).toFixed(2)}</TableCell>
                      <TableCell align="right">
                        {formatInvoiceMoney(line.unit_price)}
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 650 }}>
                        {formatInvoiceMoney(line.line_total)}
                      </TableCell>
                      {isDraft && (
                        <TableCell align="right">
                          {line.source_type === "custom" && (
                            <IconButton
                              size="small"
                              aria-label={`Delete line ${line.description}`}
                              onClick={() => {
                                deleteLine.mutate(line.id, {
                                  onError: (error: Error) =>
                                    snackbar.show(error.message, "error"),
                                });
                              }}
                            >
                              <DeleteOutlineIcon fontSize="small" />
                            </IconButton>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          </DataTableContainer>

          <Paper variant="outlined" sx={{ p: 2.5 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 650, mb: 1 }}>
              Notes
            </Typography>
            <Typography
              variant="body2"
              color={data.notes ? "text.primary" : "text.disabled"}
              sx={{ whiteSpace: "pre-wrap" }}
            >
              {data.notes || "No notes."}
            </Typography>
          </Paper>
        </>
      )}
      <ConfirmDialog
        open={confirmSend}
        title="Mark invoice sent?"
        description="This changes the invoice status to sent and locks its line items. It does not email the family or deliver the PDF."
        confirmLabel={sendInvoice.isPending ? "Sending…" : "Mark sent"}
        pending={sendInvoice.isPending}
        onClose={() => setConfirmSend(false)}
        onConfirm={handleSend}
      />
      {data && (
        <>
          <EditInvoiceDialog
            open={editOpen}
            invoice={data}
            pending={patchInvoice.isPending}
            onClose={() => setEditOpen(false)}
            onSave={(body) => {
              patchInvoice.mutate(body, {
                onSuccess: () => {
                  setEditOpen(false);
                  snackbar.show("Invoice updated");
                },
                onError: (error: Error) => snackbar.show(error.message, "error"),
              });
            }}
          />
          <AddCustomLineDialog
            open={addLineOpen}
            pending={addCustomLine.isPending}
            onClose={() => setAddLineOpen(false)}
            onSave={(body) => {
              addCustomLine.mutate(body, {
                onSuccess: () => {
                  setAddLineOpen(false);
                  snackbar.show("Line item added");
                },
                onError: (error: Error) => snackbar.show(error.message, "error"),
              });
            }}
          />
          <MarkPaidDialog
            open={markPaidOpen}
            invoice={data}
            pending={markPaid.isPending}
            onClose={() => setMarkPaidOpen(false)}
            onSave={(body) => {
              markPaid.mutate(body, {
                onSuccess: () => {
                  setMarkPaidOpen(false);
                  snackbar.show("Invoice marked paid");
                },
                onError: (error: Error) => snackbar.show(error.message, "error"),
              });
            }}
          />
        </>
      )}
      <ConfirmDialog
        open={confirmVoid}
        title="Void invoice?"
        description="Voiding releases the source time entries and expenses back to the uninvoiced pool."
        confirmLabel={voidInvoice.isPending ? "Voiding…" : "Void invoice"}
        confirmColor="error"
        pending={voidInvoice.isPending}
        onClose={() => setConfirmVoid(false)}
        onConfirm={handleVoid}
      />
      <ConfirmDialog
        open={confirmDelete}
        title="Delete draft invoice?"
        description="Deleting this draft releases its source time entries and expenses back to the uninvoiced pool. The invoice is soft-deleted server-side."
        confirmLabel={deleteInvoice.isPending ? "Deleting…" : "Delete invoice"}
        confirmColor="error"
        pending={deleteInvoice.isPending}
        onClose={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
      />
    </Stack>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <Grid item xs={12} sm={6}>
      <Typography variant="overline" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2">{value}</Typography>
    </Grid>
  );
}

function EditInvoiceDialog({
  open,
  invoice,
  pending,
  onClose,
  onSave,
}: {
  open: boolean;
  invoice: InvoiceDetailData;
  pending: boolean;
  onClose: () => void;
  onSave: (body: InvoiceDraftUpdateBody) => void;
}) {
  const [issueDate, setIssueDate] = useState(invoice.issue_date ?? "");
  const [dueDate, setDueDate] = useState(invoice.due_date ?? "");
  const [tax, setTax] = useState(invoice.tax ?? "0");
  const [notes, setNotes] = useState(invoice.notes ?? "");

  const reset = () => {
    setIssueDate(invoice.issue_date ?? "");
    setDueDate(invoice.due_date ?? "");
    setTax(invoice.tax ?? "0");
    setNotes(invoice.notes ?? "");
  };

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!pending) {
          reset();
          onClose();
        }
      }}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle>Edit draft invoice</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
            <TextField
              label="Issue date"
              type="date"
              size="small"
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={{ flex: 1 }}
            />
            <TextField
              label="Due date"
              type="date"
              size="small"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={{ flex: 1 }}
            />
            <TextField
              label="Tax"
              type="number"
              size="small"
              value={tax}
              onChange={(e) => setTax(e.target.value)}
              inputProps={{ min: "0", step: "0.01" }}
              sx={{ flex: 1 }}
            />
          </Stack>
          <TextField
            label="Notes"
            multiline
            minRows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button
          onClick={() => {
            reset();
            onClose();
          }}
          disabled={pending}
        >
          Cancel
        </Button>
        <Button
          variant="contained"
          disabled={pending}
          onClick={() =>
            onSave({
              issue_date: issueDate || null,
              due_date: dueDate || null,
              tax: tax.trim() || "0",
              notes: notes.trim() || null,
            })
          }
        >
          {pending ? "Saving…" : "Save"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function AddCustomLineDialog({
  open,
  pending,
  onClose,
  onSave,
}: {
  open: boolean;
  pending: boolean;
  onClose: () => void;
  onSave: (body: CustomLineItemBody) => void;
}) {
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState("");

  const reset = () => {
    setDescription("");
    setQuantity("1");
    setUnitPrice("");
  };

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!pending) {
          reset();
          onClose();
        }
      }}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle>Add custom line</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            autoFocus
          />
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
            <TextField
              label="Quantity"
              type="number"
              size="small"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              inputProps={{ min: "0.01", step: "0.01" }}
              sx={{ flex: 1 }}
            />
            <TextField
              label="Unit price"
              type="number"
              size="small"
              value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)}
              inputProps={{ min: "0", step: "0.01" }}
              sx={{ flex: 1 }}
            />
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button
          onClick={() => {
            reset();
            onClose();
          }}
          disabled={pending}
        >
          Cancel
        </Button>
        <Button
          variant="contained"
          disabled={pending || !description.trim() || !quantity || !unitPrice}
          onClick={() => {
            onSave({
              description: description.trim(),
              quantity,
              unit_price: unitPrice,
            });
            reset();
          }}
        >
          {pending ? "Adding…" : "Add line"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function MarkPaidDialog({
  open,
  invoice,
  pending,
  onClose,
  onSave,
}: {
  open: boolean;
  invoice: InvoiceDetailData;
  pending: boolean;
  onClose: () => void;
  onSave: (body: { paid_date?: string | null; paid_amount?: string | null }) => void;
}) {
  const [paidDate, setPaidDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [paidAmount, setPaidAmount] = useState(invoice.total);

  const reset = () => {
    setPaidDate(dayjs().format("YYYY-MM-DD"));
    setPaidAmount(invoice.total);
  };

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!pending) {
          reset();
          onClose();
        }
      }}
      maxWidth="xs"
      fullWidth
    >
      <DialogTitle>Mark invoice paid</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Paid date"
            type="date"
            size="small"
            value={paidDate}
            onChange={(e) => setPaidDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label="Paid amount"
            type="number"
            size="small"
            value={paidAmount}
            onChange={(e) => setPaidAmount(e.target.value)}
            inputProps={{ min: "0", step: "0.01" }}
            helperText="Must equal the invoice total."
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button
          onClick={() => {
            reset();
            onClose();
          }}
          disabled={pending}
        >
          Cancel
        </Button>
        <Button
          variant="contained"
          disabled={pending}
          onClick={() =>
            onSave({
              paid_date: paidDate || null,
              paid_amount: paidAmount || invoice.total,
            })
          }
        >
          {pending ? "Saving…" : "Mark paid"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function TotalRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2 }}>
      <Typography
        variant={strong ? "subtitle1" : "body2"}
        color={strong ? "text.primary" : "text.secondary"}
        sx={{ fontWeight: strong ? 700 : 400 }}
      >
        {label}
      </Typography>
      <Typography
        variant={strong ? "subtitle1" : "body2"}
        sx={{ fontWeight: strong ? 700 : 600 }}
      >
        {value}
      </Typography>
    </Box>
  );
}
