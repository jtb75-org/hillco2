import { QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../../api/client";
import type {
  InvoiceDetail,
  InvoiceCreateBody,
  InvoiceListResponse,
  InvoiceListStatus,
  UninvoicedResponse,
} from "./invoiceTypes";

export const invoiceKeys = {
  all: ["invoices"] as const,
  list: (filters: InvoiceListFilters) => ["invoices", "list", filters] as const,
  detail: (invoiceId: string) => ["invoices", "detail", invoiceId] as const,
  uninvoiced: (engagementId: string) =>
    ["invoices", "uninvoiced", engagementId] as const,
  engagementList: (engagementId: string) =>
    ["invoices", "engagement", engagementId] as const,
};

export interface InvoiceListFilters {
  status?: InvoiceListStatus;
  engagement_id?: string | null;
}

export function useInvoicesList(filters: InvoiceListFilters) {
  return useQuery<InvoiceListResponse, Error>({
    queryKey: invoiceKeys.list(filters),
    queryFn: async () => {
      const { data, error } = await api.GET("/api/invoices", {
        params: { query: filters },
      });
      if (error || !data) throw new Error("Failed to load invoices.");
      return data as InvoiceListResponse;
    },
  });
}

export function useInvoice(invoiceId: string | undefined) {
  return useQuery<InvoiceDetail, Error>({
    queryKey: invoiceKeys.detail(invoiceId ?? ""),
    enabled: !!invoiceId,
    queryFn: async () => {
      const { data, error } = await api.GET("/api/invoices/{invoice_id}", {
        params: { path: { invoice_id: invoiceId! } },
      });
      if (error || !data) throw new Error("Failed to load invoice.");
      return data as InvoiceDetail;
    },
  });
}

export function useUninvoicedForEngagement(engagementId: string | undefined) {
  return useQuery<UninvoicedResponse, Error>({
    queryKey: invoiceKeys.uninvoiced(engagementId ?? ""),
    enabled: !!engagementId,
    queryFn: async () => {
      const { data, error } = await api.GET(
        "/api/engagements/{engagement_id}/uninvoiced",
        { params: { path: { engagement_id: engagementId! } } },
      );
      if (error || !data) throw new Error("Failed to load uninvoiced work.");
      return data as UninvoicedResponse;
    },
  });
}

export function useEngagementInvoices(engagementId: string | undefined) {
  return useQuery<InvoiceListResponse, Error>({
    queryKey: invoiceKeys.engagementList(engagementId ?? ""),
    enabled: !!engagementId,
    queryFn: async () => {
      const { data, error } = await api.GET("/api/invoices", {
        params: { query: { status: "all", engagement_id: engagementId } },
      });
      if (error || !data) throw new Error("Failed to load engagement invoices.");
      return data as InvoiceListResponse;
    },
  });
}

export function useCreateInvoice(engagementId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: InvoiceCreateBody) => {
      const { data, error } = await api.POST(
        "/api/engagements/{engagement_id}/invoices",
        {
          params: { path: { engagement_id: engagementId } },
          body,
        },
      );
      if (error || !data) throw new Error("Failed to create invoice.");
      return data as InvoiceDetail;
    },
    onSuccess: () => {
      invalidateInvoiceWorkflow(qc, engagementId);
    },
  });
}

export function useSendInvoice(invoiceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await api.POST("/api/invoices/{invoice_id}/send", {
        params: { path: { invoice_id: invoiceId } },
      });
      if (error) throw new Error("Failed to send invoice.");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: invoiceKeys.all });
    },
  });
}

function invalidateInvoiceWorkflow(
  qc: QueryClient,
  engagementId?: string,
) {
  qc.invalidateQueries({ queryKey: invoiceKeys.all });
  qc.invalidateQueries({ queryKey: ["dashboard"] });
  if (engagementId) {
    qc.invalidateQueries({ queryKey: ["engagements", engagementId] });
    qc.invalidateQueries({ queryKey: ["engagements", engagementId, "time-entries"] });
    qc.invalidateQueries({ queryKey: ["engagements", engagementId, "expenses"] });
  }
}

export function useMarkPaidInvoice(invoiceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { paid_date?: string | null; paid_amount?: string | null }) => {
      const { error } = await api.POST("/api/invoices/{invoice_id}/mark-paid", {
        params: { path: { invoice_id: invoiceId } },
        body,
      });
      if (error) throw new Error("Failed to mark invoice paid.");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: invoiceKeys.all });
    },
  });
}

export function useVoidInvoice(invoiceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await api.POST("/api/invoices/{invoice_id}/void", {
        params: { path: { invoice_id: invoiceId } },
      });
      if (error) throw new Error("Failed to void invoice.");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: invoiceKeys.all });
    },
  });
}
