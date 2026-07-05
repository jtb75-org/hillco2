import { Chip, type ChipProps } from "@mui/material";

import {
  invoiceStatusLabel,
  isInvoiceOverdue,
} from "./invoiceFormatters";
import type { InvoiceStatus } from "./invoiceTypes";

interface InvoiceStatusChipProps {
  status: InvoiceStatus;
  dueDate?: string | null;
  size?: ChipProps["size"];
}

export function InvoiceStatusChip({
  status,
  dueDate,
  size = "small",
}: InvoiceStatusChipProps) {
  const overdue = isInvoiceOverdue(status, dueDate);
  const color: ChipProps["color"] =
    overdue ? "error" : status === "paid" ? "success" : status === "void" ? "default" : "primary";
  const variant: ChipProps["variant"] =
    status === "draft" || status === "void" ? "outlined" : "filled";

  return (
    <Chip
      size={size}
      color={color}
      variant={variant}
      label={invoiceStatusLabel(status, overdue)}
    />
  );
}
