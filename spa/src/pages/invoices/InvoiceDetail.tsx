import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  Grid,
  Link as MuiLink,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import PictureAsPdfOutlinedIcon from "@mui/icons-material/PictureAsPdfOutlined";
import { Link, useParams } from "react-router-dom";

import { DataTableContainer } from "../../components/DataTableContainer";
import { PageHeader } from "../../components/PageHeader";
import { InvoiceStatusChip } from "./InvoiceStatusChip";
import { useInvoice } from "./invoiceApi";
import {
  formatInvoiceDate,
  formatInvoiceMoney,
  sourceTypeLabel,
} from "./invoiceFormatters";

export function InvoiceDetail() {
  const { id } = useParams<{ id: string }>();
  const invoice = useInvoice(id);
  const data = invoice.data;

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
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Description</TableCell>
                  <TableCell>Source</TableCell>
                  <TableCell align="right">Quantity</TableCell>
                  <TableCell align="right">Rate</TableCell>
                  <TableCell align="right">Line total</TableCell>
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
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </DataTableContainer>

          {data.notes && (
            <Paper variant="outlined" sx={{ p: 2.5 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 650, mb: 1 }}>
                Notes
              </Typography>
              <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                {data.notes}
              </Typography>
            </Paper>
          )}
        </>
      )}
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
