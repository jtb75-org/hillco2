import dayjs from "dayjs";

import type { InvoiceStatus } from "./invoiceTypes";

export const invoiceCurrency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export function formatInvoiceMoney(value: string | number | null | undefined) {
  return invoiceCurrency.format(Number(value ?? 0));
}

export function formatInvoiceDate(value: string | null | undefined) {
  return value ? dayjs(value).format("MMM D, YYYY") : "—";
}

export function isInvoiceOverdue(status: InvoiceStatus, dueDate: string | null | undefined) {
  return status === "sent" && !!dueDate && dayjs(dueDate).isBefore(dayjs(), "day");
}

export function invoiceStatusLabel(status: InvoiceStatus, overdue = false) {
  if (overdue) return "Overdue";
  switch (status) {
    case "draft":
      return "Draft";
    case "sent":
      return "Sent";
    case "paid":
      return "Paid";
    case "overdue":
      return "Overdue";
    case "void":
      return "Void";
  }
}

export function sourceTypeLabel(sourceType: string | null) {
  switch (sourceType) {
    case "time":
      return "Time";
    case "expense":
      return "Expense";
    case "custom":
      return "Custom";
    default:
      return "Line";
  }
}
