export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "void";
export type InvoiceListStatus = "open" | "paid" | "draft" | "void" | "all";

export interface InvoiceListRow {
  id: string;
  invoice_number: string;
  status: InvoiceStatus;
  issue_date: string | null;
  due_date: string | null;
  subtotal: string;
  tax: string;
  total: string;
  paid_amount: string | null;
  paid_date: string | null;
  sent_at: string | null;
  engagement_id: string;
  family_id: string;
  household_name: string;
}

export interface InvoiceSummaryRow {
  engagement_id: string;
  uninvoiced_total: string;
  billed_total: string;
  paid_total: string;
  outstanding_balance: string;
  family_id: string;
  household_name: string;
}

export interface InvoiceTotals {
  uninvoiced: string;
  invoiced: string;
  paid: string;
  outstanding: string;
}

export interface InvoiceListResponse {
  invoices: InvoiceListRow[];
  summary: InvoiceSummaryRow[];
  totals: InvoiceTotals;
}

export interface InvoiceLineItem {
  id: string;
  sort_order: number;
  description: string;
  quantity: string;
  unit_price: string;
  line_total: string;
  source_type: "time" | "expense" | "custom" | null;
  source_id: string | null;
}

export interface InvoiceEmailAudit {
  id: string;
  to_address: string;
  cc_addresses: string[];
  bcc_addresses: string[];
  subject: string;
  sent_at: string;
  smtp_message_id: string | null;
  sent_by_name: string | null;
}

export interface InvoiceDetail {
  id: string;
  invoice_number: string;
  engagement_id: string;
  status: InvoiceStatus;
  issue_date: string | null;
  due_date: string | null;
  sent_at: string | null;
  paid_date: string | null;
  paid_amount: string | null;
  subtotal: string;
  tax: string;
  total: string;
  notes: string | null;
  created_by: string | null;
  is_overdue: boolean;
  family: {
    id: string;
    household_name: string;
  };
  line_items: InvoiceLineItem[];
  emails: InvoiceEmailAudit[];
}

export interface UninvoicedTimeEntry {
  id: string;
  work_date: string;
  hours: string;
  description: string | null;
  hourly_rate: string | null;
  user_name: string | null;
}

export interface UninvoicedExpense {
  id: string;
  expense_date: string;
  amount: string;
  category: string | null;
  description: string | null;
  user_name: string | null;
}

export interface UninvoicedResponse {
  time_entries: UninvoicedTimeEntry[];
  expenses: UninvoicedExpense[];
}

export interface InvoiceCreateBody {
  issue_date?: string | null;
  due_date?: string | null;
  tax: string;
  notes?: string | null;
  time_entry_ids?: string[];
  expense_ids?: string[];
}

export interface InvoiceDraftUpdateBody {
  issue_date?: string | null;
  due_date?: string | null;
  tax?: string | null;
  notes?: string | null;
}

export interface CustomLineItemBody {
  description: string;
  quantity: string;
  unit_price: string;
}

export interface EmailInvoiceBody {
  to?: string | null;
  cc?: string[];
  bcc?: string[];
  subject?: string | null;
  body?: string | null;
}
