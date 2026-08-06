import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { Payment, PaymentInput } from '../types/invoice';

const KEY = 'payments';

/** 入金一覧取得 */
export function usePayments(filters?: { customer_id?: number; invoice_id?: number }) {
  const params = new URLSearchParams();
  if (filters?.customer_id) params.set('customer_id', String(filters.customer_id));
  if (filters?.invoice_id) params.set('invoice_id', String(filters.invoice_id));
  const qs = params.toString();
  return useQuery({
    queryKey: [KEY, filters],
    queryFn: () => api.get<Payment[]>(`/payments${qs ? `?${qs}` : ''}`),
  });
}

/** 入金登録 */
export function useCreatePayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: PaymentInput) => api.post<Payment>('/payments', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [KEY] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
    },
  });
}

/** 入金削除時のレスポンス。history_idはUndoトーストからの復元に使う（R-0098） */
export interface DeleteResult {
  deleted: boolean;
  history_id: number | null;
}

/** 入金削除（取消） */
export function useDeletePayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete<DeleteResult>(`/payments/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [KEY] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
    },
  });
}
