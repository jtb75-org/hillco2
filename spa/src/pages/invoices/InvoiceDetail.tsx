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
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import dayjs from "dayjs";

import { ConfirmDialog } from "../../components/ConfirmDialog";
import { DataTableContainer } from "../../components/DataTableContainer";
import { PageHeader } from "../../components/PageHeader";
import { useSnackbar } from "../../components/Snackbar";
import { useAuth } from "../../auth";
import { InvoiceStatusChip } from "./InvoiceStatusChip";
import {
  useAddCustomLineItem,
  useDeleteInvoice,
  useDeleteLineItem,
  useEmailInvoice,
  useInvoice,
  useInvoiceEmailRecipient,
  useMarkPaidInvoice,
  usePatchInvoice,
  useVoidInvoice,
} from "./invoiceApi";
import {
  formatInvoiceDate,
  formatInvoiceMoney,
  sourceTypeLabel,
} from "./invoiceFormatters";
import type {
  CustomLineItemBody,
  EmailInvoiceBody,
  InvoiceEmailAudit,
  InvoiceDetail as InvoiceDetailData,
  InvoiceDraftUpdateBody,
} from "./invoiceTypes";

export function InvoiceDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const snackbar = useSnackbar();
  const { user } = useAuth();
  const [sendEmailOpen, setSendEmailOpen] = useState(false);
  const [sendEmailMode, setSendEmailMode] = useState<"send" | "resend">("send");
  const [editOpen, setEditOpen] = useState(false);
  const [addLineOpen, setAddLineOpen] = useState(false);
  const [markPaidOpen, setMarkPaidOpen] = useState(false);
  const [confirmVoid, setConfirmVoid] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const invoice = useInvoice(id);
  const data = invoice.data;
  const emailRecipient = useInvoiceEmailRecipient(data?.family.id);
  const emailInvoice = useEmailInvoice(id ?? "", data?.engagement_id);
  const patchInvoice = usePatchInvoice(id ?? "", data?.engagement_id);
  const addCustomLine = useAddCustomLineItem(id ?? "", data?.engagement_id);
  const deleteLine = useDeleteLineItem(id ?? "", data?.engagement_id);
  const markPaid = useMarkPaidInvoice(id ?? "", data?.engagement_id);
  const voidInvoice = useVoidInvoice(id ?? "", data?.engagement_id);
  const deleteInvoice = useDeleteInvoice(id ?? "", data?.engagement_id);

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
  const isSent = data?.status === "sent" || data?.status === "overdue";
  const latestEmail = data?.emails?.[0] ?? null;

  if (invoice.error) {
    return (
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" component={Link} to="/invoices">
            Back to invoices
          </Button>
        }
      >
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
                  onClick={() => {
                    setSendEmailMode("send");
                    setSendEmailOpen(true);
                  }}
                >
                  Send invoice email
                </Button>
              )}
              {isSent && (
                <Button
                  variant="outlined"
                  startIcon={<SendOutlinedIcon />}
                  onClick={() => {
                    setSendEmailMode("resend");
                    setSendEmailOpen(true);
                  }}
                >
                  Resend email
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
          {/* CSS grid — Grid v1's negative-margin gutters were
              pulling the top-row panels a few pixels off the left/right
              of the cards below. Box-grid with `gap` aligns flush with
              the rest of the page rhythm. */}
          <Box
            sx={{
              display: "grid",
              gap: 2,
              gridTemplateColumns: {
                xs: "1fr",
                md: "7fr 5fr",
              },
            }}
          >
            <Paper variant="outlined" sx={{ p: 2.5, height: "100%" }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 650, mb: 2 }}>
                Invoice details
              </Typography>
              <Box
                sx={{
                  display: "grid",
                  gap: 2,
                  gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
                }}
              >
                <DetailItem label="Household" value={data.family.household_name} />
                <DetailItem label="Issued" value={formatInvoiceDate(data.issue_date)} />
                <DetailItem label="Due" value={formatInvoiceDate(data.due_date)} />
                <DetailItem label="Sent" value={formatInvoiceDate(data.sent_at)} />
                <DetailItem label="Paid" value={formatInvoiceDate(data.paid_date)} />
                <DetailItem label="Engagement" value={data.engagement_id.slice(0, 8)} />
              </Box>
            </Paper>
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
          </Box>

          <DataTableContainer
            empty={data.line_items.length === 0}
            emptyTitle="No line items"
            emptyDescription="Draft custom lines and selected billable work will appear here."
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

          <SentEmailsLog emails={data.emails ?? []} />
        </>
      )}
      {data && (
        <>
          <SendInvoiceEmailDialog
            open={sendEmailOpen}
            mode={sendEmailMode}
            invoice={data}
            initialRecipient={emailRecipient.data ?? ""}
            operatorEmail={user?.email ?? ""}
            latestEmail={sendEmailMode === "resend" ? latestEmail : null}
            pending={emailInvoice.isPending}
            onClose={() => setSendEmailOpen(false)}
            onSave={(body) => {
              emailInvoice.mutate(body, {
                onSuccess: () => {
                  setSendEmailOpen(false);
                  snackbar.show(
                    sendEmailMode === "resend"
                      ? "Invoice email resent"
                      : "Invoice email sent",
                  );
                },
                onError: (error: Error) => snackbar.show(error.message, "error"),
              });
            }}
          />
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
    <Box>
      <Typography variant="overline" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2">{value}</Typography>
    </Box>
  );
}

function SendInvoiceEmailDialog({
  open,
  mode,
  invoice,
  initialRecipient,
  operatorEmail,
  latestEmail,
  pending,
  onClose,
  onSave,
}: {
  open: boolean;
  mode: "send" | "resend";
  invoice: InvoiceDetailData;
  initialRecipient: string;
  operatorEmail: string;
  latestEmail: InvoiceEmailAudit | null;
  pending: boolean;
  onClose: () => void;
  onSave: (body: EmailInvoiceBody) => void;
}) {
  const defaultSubject = defaultEmailSubject(invoice);
  const defaultBody = defaultEmailBody(invoice);
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody);

  const reset = () => {
    setTo(latestEmail?.to_address ?? initialRecipient);
    setCc(formatAddressList(latestEmail?.cc_addresses));
    setBcc(formatAddressList(latestEmail?.bcc_addresses) || operatorEmail);
    setSubject(latestEmail?.subject ?? defaultSubject);
    setBody(defaultBody);
  };

  useEffect(() => {
    if (!open) return;
    reset();
  }, [
    open,
    mode,
    invoice.id,
    invoice.invoice_number,
    invoice.total,
    initialRecipient,
    operatorEmail,
    latestEmail?.id,
    latestEmail?.to_address,
    latestEmail?.subject,
  ]);

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!pending) onClose();
      }}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle>
        {mode === "resend" ? "Resend invoice email" : "Send invoice email"}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="To"
            type="email"
            size="small"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            required
            autoFocus
            helperText={
              initialRecipient
                ? "Defaults to the family's billing contact."
                : "No billing contact email found; enter a recipient."
            }
          />
          <TextField
            label="CC"
            size="small"
            value={cc}
            onChange={(e) => setCc(e.target.value)}
            placeholder="optional@example.com"
            helperText="Separate multiple addresses with commas."
          />
          <TextField
            label="BCC"
            size="small"
            value={bcc}
            onChange={(e) => setBcc(e.target.value)}
            helperText="Defaults to the current operator."
          />
          <TextField
            label="Subject"
            size="small"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            required
          />
          <TextField
            label="Message"
            multiline
            minRows={5}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            required
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button
          variant="contained"
          disabled={pending || !to.trim() || !subject.trim() || !body.trim()}
          onClick={() =>
            onSave({
              to: to.trim(),
              cc: splitAddresses(cc),
              bcc: splitAddresses(bcc),
              subject: subject.trim(),
              body: body.trim(),
            })
          }
        >
          {pending
            ? "Sending..."
            : mode === "resend"
              ? "Resend email"
              : "Send email"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function SentEmailsLog({ emails }: { emails: InvoiceEmailAudit[] }) {
  return (
    <Stack spacing={1}>
      <Typography variant="subtitle1" sx={{ fontWeight: 650 }}>
        Sent emails
      </Typography>
      <DataTableContainer
        empty={emails.length === 0}
        emptyTitle="No sent emails"
        emptyDescription="Invoice email delivery attempts will appear here."
      >
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Sent</TableCell>
              <TableCell>To</TableCell>
              <TableCell>Subject</TableCell>
              <TableCell>Sent by</TableCell>
              <TableCell>Message ID</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {emails.map((email) => (
              <TableRow key={email.id}>
                <TableCell sx={{ whiteSpace: "nowrap" }}>
                  {formatInvoiceDateTime(email.sent_at)}
                </TableCell>
                <TableCell>
                  <Typography variant="body2">{email.to_address}</Typography>
                  {email.cc_addresses.length > 0 && (
                    <Typography variant="caption" color="text.secondary">
                      CC: {formatAddressList(email.cc_addresses)}
                    </Typography>
                  )}
                </TableCell>
                <TableCell>{email.subject}</TableCell>
                <TableCell>{email.sent_by_name || "Unknown"}</TableCell>
                <TableCell sx={{ fontFamily: "monospace", fontSize: 12 }}>
                  {email.smtp_message_id || "Not recorded"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DataTableContainer>
    </Stack>
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
  // Defensive String(): the OpenAPI schema types tax as string (Decimal
  // serialized that way), but in practice the FastAPI route can hand
  // back a JSON number. We later call .trim() on tax/notes, so make
  // sure local state is always a string regardless of wire format.
  const [issueDate, setIssueDate] = useState(invoice.issue_date ?? "");
  const [dueDate, setDueDate] = useState(invoice.due_date ?? "");
  const [tax, setTax] = useState(String(invoice.tax ?? "0"));
  const [notes, setNotes] = useState(String(invoice.notes ?? ""));

  useEffect(() => {
    if (!open) return;
    setIssueDate(invoice.issue_date ?? "");
    setDueDate(invoice.due_date ?? "");
    setTax(String(invoice.tax ?? "0"));
    setNotes(String(invoice.notes ?? ""));
  }, [open, invoice.id, invoice.issue_date, invoice.due_date, invoice.tax, invoice.notes]);

  const reset = () => {
    setIssueDate(invoice.issue_date ?? "");
    setDueDate(invoice.due_date ?? "");
    setTax(String(invoice.tax ?? "0"));
    setNotes(String(invoice.notes ?? ""));
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
  const amountMatchesTotal =
    toCurrencyCents(paidAmount) === toCurrencyCents(invoice.total);

  const reset = () => {
    setPaidDate(dayjs().format("YYYY-MM-DD"));
    setPaidAmount(invoice.total);
  };

  useEffect(() => {
    if (!open) return;
    setPaidDate(dayjs().format("YYYY-MM-DD"));
    setPaidAmount(invoice.total);
  }, [open, invoice.id, invoice.total]);

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
            error={paidAmount !== "" && !amountMatchesTotal}
            helperText={`Must equal ${formatInvoiceMoney(invoice.total)}.`}
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
          disabled={pending || !paidDate || !paidAmount || !amountMatchesTotal}
          onClick={() =>
            onSave({
              paid_date: paidDate || null,
              paid_amount: paidAmount,
            })
          }
        >
          {pending ? "Saving…" : "Mark paid"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function defaultEmailSubject(invoice: InvoiceDetailData) {
  return `Invoice ${invoice.invoice_number} from HillCo`;
}

function defaultEmailBody(invoice: InvoiceDetailData) {
  return [
    "Hello,",
    "",
    `Please find invoice ${invoice.invoice_number} attached. Total: ${formatInvoiceMoney(invoice.total)}.`,
    "",
    "Thank you.",
  ].join("\n");
}

function splitAddresses(value: string) {
  return value
    .split(",")
    .map((address) => address.trim())
    .filter(Boolean);
}

function formatAddressList(addresses: string[] | undefined) {
  return (addresses ?? []).filter(Boolean).join(", ");
}

function formatInvoiceDateTime(value: string | null | undefined) {
  if (!value) return "Not recorded";
  return dayjs(value).format("MMM D, YYYY h:mm A");
}

function toCurrencyCents(value: string | number | null | undefined) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return Number.NaN;
  return Math.round(amount * 100);
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
