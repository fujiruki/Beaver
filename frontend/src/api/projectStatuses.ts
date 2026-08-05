import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client';

export interface ProjectStatusMaster {
  id: number;
  name: string;
  sort_order: number;
  is_active: number;
  created_at: string;
}

const KEY = 'projectStatuses';

export function useProjectStatuses() {
  return useQuery({
    queryKey: [KEY],
    queryFn: () => api.get<ProjectStatusMaster[]>('/project-statuses'),
  });
}

export function useCreateProjectStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; sort_order?: number }) =>
      api.post<ProjectStatusMaster>('/project-statuses', data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: [KEY] }); },
  });
}

export function useUpdateProjectStatus(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<ProjectStatusMaster>) =>
      api.put<ProjectStatusMaster>(`/project-statuses/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: [KEY] }); },
  });
}

export function useDeleteProjectStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete<{ deleted: boolean }>(`/project-statuses/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: [KEY] }); },
  });
}
