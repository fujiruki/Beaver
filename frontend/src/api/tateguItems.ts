import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { TateguItem, TateguItemInput, CostBreakdownLine } from '../types/tateguItem';
import type { PaginatedResponse } from '../types/pagination';

const KEY = 'tateguItems';

export function useTateguItems() {
  return useQuery({
    queryKey: [KEY],
    queryFn: () => api.get<TateguItem[]>('/tategu-items'),
  });
}

/** 建具台帳一覧取得（ページネーション付き・一覧ページ用） */
export function useTateguItemsPaged(page: number, search = '') {
  return useQuery({
    queryKey: [KEY, 'paged', page, search],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), per_page: '50' });
      if (search) params.set('q', search);
      return api.get<PaginatedResponse<TateguItem>>(`/tategu-items?${params}`);
    },
  });
}

export function useTateguItem(id: number) {
  return useQuery({
    queryKey: [KEY, id],
    queryFn: () => api.get<TateguItem>(`/tategu-items/${id}`),
    enabled: id > 0,
  });
}

export function useCreateTateguItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: TateguItemInput) => api.post<TateguItem>('/tategu-items', data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: [KEY] }); },
  });
}

export function useUpdateTateguItem(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: TateguItemInput) => api.put<TateguItem>(`/tategu-items/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [KEY] });
      queryClient.invalidateQueries({ queryKey: [KEY, id] });
    },
  });
}

export function useUpdateCostBreakdown(tateguItemId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (lines: Omit<CostBreakdownLine, 'id' | 'tategu_item_id'>[]) =>
      api.put<{ ok: boolean }>(`/tategu-items/${tateguItemId}/cost-breakdown`, { lines }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: [KEY, tateguItemId] }); },
  });
}

export function useDeleteTateguItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete<void>(`/tategu-items/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: [KEY] }); },
  });
}
