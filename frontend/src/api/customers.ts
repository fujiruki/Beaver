import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { api } from './client';
import type { Customer, CustomerInput } from '../types/customer';
import type { PaginatedResponse } from '../types/pagination';

const KEY = 'customers';

/** 得意先一覧取得（全件・ドロップダウン用） */
export function useCustomers() {
  return useQuery({
    queryKey: [KEY],
    queryFn: () => api.get<Customer[]>('/customers'),
  });
}

/** 得意先一覧取得（ページネーション付き・一覧ページ用） */
export function useCustomersPaged(page: number, search = '') {
  return useQuery({
    queryKey: [KEY, 'paged', page, search],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), per_page: '50' });
      if (search) params.set('q', search);
      return api.get<PaginatedResponse<Customer>>(`/customers?${params}`);
    },
    placeholderData: keepPreviousData,
  });
}

/** 得意先1件取得 */
export function useCustomer(id: number) {
  return useQuery({
    queryKey: [KEY, id],
    queryFn: () => api.get<Customer>(`/customers/${id}`),
    enabled: id > 0,
  });
}

/** 得意先作成 */
export function useCreateCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CustomerInput) => api.post<Customer>('/customers', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [KEY] });
    },
  });
}

/** 得意先更新 */
export function useUpdateCustomer(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CustomerInput) => api.put<Customer>(`/customers/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [KEY] });
      queryClient.invalidateQueries({ queryKey: [KEY, id] });
    },
  });
}

/** 繰越残高例外修正 */
export function useUpdateCarryForward(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (balance: number) =>
      api.patch<Customer>(`/customers/${id}/carry-forward`, { carry_forward_balance: balance }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [KEY] });
      queryClient.invalidateQueries({ queryKey: [KEY, id] });
    },
  });
}

/** 得意先削除 */
export function useDeleteCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete<void>(`/customers/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [KEY] });
    },
  });
}
