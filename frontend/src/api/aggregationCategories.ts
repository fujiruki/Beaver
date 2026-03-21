import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client';

export interface AggregationCategoryMaster {
  id: number;
  code: string;
  name: string;
  measure_type: 'money' | 'time';
  sort_order: number;
  is_active: number;
  synced_at: string;
}

export function useAggregationCategories() {
  return useQuery({
    queryKey: ['aggregation-categories'],
    queryFn: () => api.get<AggregationCategoryMaster[]>('/aggregation-categories'),
    staleTime: 1000 * 60 * 5,
  });
}

export function useSyncAggregationCategories() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ synced: number; categories: AggregationCategoryMaster[] }>('/aggregation-categories/sync', {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['aggregation-categories'] });
    },
  });
}
