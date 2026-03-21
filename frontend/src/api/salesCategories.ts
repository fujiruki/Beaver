import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client';

export interface SalesCategory {
  id: number;
  name: string;
  sort_order: number;
  is_active: number;
  created_at: string;
}

const KEY = 'salesCategories';

export function useSalesCategories() {
  return useQuery({
    queryKey: [KEY],
    queryFn: () => api.get<SalesCategory[]>('/sales-categories'),
  });
}

export function useCreateSalesCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; sort_order?: number }) =>
      api.post<SalesCategory>('/sales-categories', data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: [KEY] }); },
  });
}

export function useUpdateSalesCategory(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<SalesCategory>) =>
      api.put<SalesCategory>(`/sales-categories/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: [KEY] }); },
  });
}

export function useDeleteSalesCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete<{ deleted: boolean }>(`/sales-categories/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: [KEY] }); },
  });
}
