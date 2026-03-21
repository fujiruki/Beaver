import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { Invoice, InvoiceInput } from '../types/invoice';

const KEY = 'invoices';

type InvoiceFilters = {
  customer_id?: number;
  year?: string;
  month?: string;
};

/** 請求書一覧取得 */
export function useInvoices(filters?: InvoiceFilters) {
  const params = new URLSearchParams();
  if (filters?.customer_id) params.set('customer_id', String(filters.customer_id));
  if (filters?.year) params.set('year', filters.year);
  if (filters?.month) params.set('month', filters.month);
  const qs = params.toString();
  return useQuery({
    queryKey: [KEY, filters],
    queryFn: () => api.get<Invoice[]>(`/invoices${qs ? `?${qs}` : ''}`),
  });
}

/** 請求書1件取得（伝票・入金含む） */
export function useInvoice(id: number) {
  return useQuery({
    queryKey: [KEY, id],
    queryFn: () => api.get<Invoice>(`/invoices/${id}`),
    enabled: id > 0,
  });
}

/** 請求書作成 */
export function useCreateInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: InvoiceInput) => api.post<Invoice>('/invoices', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [KEY] });
      queryClient.invalidateQueries({ queryKey: ['vouchers'] });
    },
  });
}

/** 請求書削除 */
export function useDeleteInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete<void>(`/invoices/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [KEY] });
      queryClient.invalidateQueries({ queryKey: ['vouchers'] });
    },
  });
}
