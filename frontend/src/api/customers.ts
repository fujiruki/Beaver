import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { api } from './client';
import type { Customer, CustomerInput } from '../types/customer';
import type { PaginatedResponse, SortParam } from '../types/pagination';

const KEY = 'customers';

export interface SimilarCustomer {
  id: number;
  code: string | null;
  name: string;
  name_kana: string | null;
  tel: string | null;
  mobile: string | null;
  address1: string | null;
  is_active: number;
  access_customer_no: string | null;
  matched: Array<'tel' | 'name' | 'name_kana'>;
}

export interface SimilarCustomerParams {
  name?: string;
  name_kana?: string;
  tel?: string;
  mobile?: string;
}

async function fetchSimilarCustomers(params: SimilarCustomerParams): Promise<SimilarCustomer[]> {
  const query = new URLSearchParams();
  if (params.name) query.set('name', params.name);
  if (params.name_kana) query.set('name_kana', params.name_kana);
  if (params.tel) query.set('tel', params.tel);
  if (params.mobile) query.set('mobile', params.mobile);
  return api.get<SimilarCustomer[]>(`/customers/similar?${query}`);
}

/** 新規登録フォーム用の似た得意先候補取得。 */
export function useSimilarCustomers(params: SimilarCustomerParams, enabled: boolean) {
  return useQuery({
    queryKey: [KEY, 'similar', params.name, params.name_kana, params.tel, params.mobile],
    queryFn: () => fetchSimilarCustomers(params),
    enabled,
    retry: false,
  });
}

/** 得意先一覧取得（全件・ドロップダウン用） */
export function useCustomers() {
  return useQuery({
    queryKey: [KEY],
    queryFn: () => api.get<Customer[]>('/customers'),
  });
}

/** 得意先一覧取得（ページネーション付き・一覧ページ用） */
export function useCustomersPaged(page: number, search = '', sort?: SortParam) {
  return useQuery({
    queryKey: [KEY, 'paged', page, search, sort?.key, sort?.dir],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), per_page: '50' });
      if (search) params.set('q', search);
      // sort未指定時はsort/orderパラメータを付けない（既存のfetchモックURL互換のため）
      if (sort) {
        params.set('sort', sort.key);
        params.set('order', sort.dir);
      }
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
    mutationFn: (data: CustomerInput & { expected_updated_at?: string }) => api.put<Customer>(`/customers/${id}`, data),
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
    mutationFn: ({ id, expected_updated_at }: { id: number; expected_updated_at?: string }) =>
      api.delete<void>(`/customers/${id}`, expected_updated_at ? { expected_updated_at } : undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [KEY] });
    },
  });
}
