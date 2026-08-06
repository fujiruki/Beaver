import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { HistoryEntity, HistoryRecord } from '../types/history';

const KEY = 'history';

interface HistoryFilters {
  entity: HistoryEntity;
  entity_id?: number;
  action?: string;
}

/** 変更履歴の取得。entity_id未指定時はaction指定と組み合わせて一覧全体（削除履歴等）を取る */
export function useHistory(filters: HistoryFilters, enabled = true) {
  const params = new URLSearchParams({ entity: filters.entity });
  if (filters.entity_id) params.set('entity_id', String(filters.entity_id));
  if (filters.action) params.set('action', filters.action);
  return useQuery({
    queryKey: [KEY, filters],
    queryFn: () => api.get<HistoryRecord[]>(`/history?${params}`),
    enabled,
  });
}

/** 指定した履歴IDの状態へ復元する */
export function useRestoreHistory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (historyId: number) => api.post<Record<string, unknown>>(`/history/${historyId}/restore`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [KEY] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
    },
  });
}
