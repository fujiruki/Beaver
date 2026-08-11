import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { Voucher, VoucherInput, VoucherLine } from '../types/voucher';
import type { PaginatedResponse, SortParam } from '../types/pagination';

const KEY = 'vouchers';

type VoucherFilters = {
  q?: string;
  voucher_type?: string;
  status?: string;
  customer_id?: number;
  project_id?: number;
};

/** 伝票一覧取得（全件・KPI等用） */
export function useVouchers(filters?: VoucherFilters) {
  const params = new URLSearchParams();
  if (filters?.voucher_type) params.set('voucher_type', filters.voucher_type);
  if (filters?.status) params.set('status', filters.status);
  const qs = params.toString();
  return useQuery({
    queryKey: [KEY, filters],
    queryFn: () => api.get<Voucher[]>(`/vouchers${qs ? `?${qs}` : ''}`),
  });
}

/** 伝票一覧取得（ページネーション付き・一覧ページ用） */
export function useVouchersPaged(page: number, filters?: VoucherFilters, sort?: SortParam) {
  return useQuery({
    queryKey: [KEY, 'paged', page, filters, sort?.key, sort?.dir],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), per_page: '50' });
      if (filters?.q) params.set('q', filters.q);
      if (filters?.voucher_type) params.set('voucher_type', filters.voucher_type);
      if (filters?.status) params.set('status', filters.status);
      if (filters?.customer_id) params.set('customer_id', String(filters.customer_id));
      if (filters?.project_id) params.set('project_id', String(filters.project_id));
      // sort未指定時はsort/orderパラメータを付けない（既定の伝票日付降順を維持）
      if (sort) {
        params.set('sort', sort.key);
        params.set('order', sort.dir);
      }
      return api.get<PaginatedResponse<Voucher>>(`/vouchers?${params}`);
    },
  });
}

/** 伝票1件取得（lines[]含む） */
export function useVoucher(id: number) {
  return useQuery({
    queryKey: [KEY, id],
    queryFn: () => api.get<Voucher>(`/vouchers/${id}`),
    enabled: id > 0,
  });
}

/** 伝票作成 */
export function useCreateVoucher() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: VoucherInput) => api.post<Voucher>('/vouchers', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [KEY] });
    },
  });
}

/** 伝票更新 */
export function useUpdateVoucher(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<VoucherInput>) => api.put<Voucher>(`/vouchers/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [KEY] });
      queryClient.invalidateQueries({ queryKey: [KEY, id] });
    },
  });
}

/** 明細行追加 */
export function useAddLine(voucherId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<VoucherLine>) =>
      api.post<VoucherLine>(`/vouchers/${voucherId}/lines`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [KEY, voucherId] });
    },
  });
}

/** 明細行更新（楽観的更新付き） */
export function useUpdateLine(voucherId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ lineId, data }: { lineId: number; data: Partial<VoucherLine> }) =>
      api.put<VoucherLine>(`/vouchers/${voucherId}/lines/${lineId}`, data),
    onMutate: async ({ lineId, data }) => {
      await queryClient.cancelQueries({ queryKey: [KEY, voucherId] });
      const prev = queryClient.getQueryData<Voucher>([KEY, voucherId]);
      if (prev) {
        queryClient.setQueryData<Voucher>([KEY, voucherId], {
          ...prev,
          lines: prev.lines.map(l => l.id === lineId ? { ...l, ...data } : l),
        });
      }
      return { prev };
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) {
        queryClient.setQueryData([KEY, voucherId], context.prev);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [KEY, voucherId] });
    },
  });
}

/** 明細行削除 */
export function useDeleteLine(voucherId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (lineId: number) =>
      api.delete<void>(`/vouchers/${voucherId}/lines/${lineId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [KEY, voucherId] });
    },
  });
}

/** 見積→売上変換 */
export function useConvertToSales(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<Voucher>(`/vouchers/${id}/convert-to-sales`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [KEY] });
    },
  });
}

/** 固定列→サブテーブル一括移行 */
export function useMigrateFixedColumns() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (columnMapping: Record<string, string>) =>
      api.post<{ migrated_costs: number; migrated_prices: number }>(
        '/vouchers/migrate-fixed-columns',
        { columnMapping },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [KEY] });
    },
  });
}

/** 原価スナップショット再ロード */
export function useReloadSnapshots(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<Voucher>(`/vouchers/${id}/reload-snapshots`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [KEY, id] });
    },
  });
}
