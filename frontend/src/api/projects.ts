import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { api } from './client';
import type { Project, ProjectInput, ProjectImage } from '../types/project';
import type { PaginatedResponse, SortParam } from '../types/pagination';

const KEY = 'projects';

export function useProjects(params?: { status?: string; customer_id?: number; q?: string }) {
  const query = new URLSearchParams();
  if (params?.status) query.set('status', params.status);
  if (params?.customer_id) query.set('customer_id', String(params.customer_id));
  if (params?.q) query.set('q', params.q);
  const qs = query.toString();
  return useQuery({
    queryKey: [KEY, params ?? {}],
    queryFn: () => api.get<Project[]>(`/projects${qs ? '?' + qs : ''}`),
  });
}

/** 案件一覧取得（ページネーション付き・一覧ページ用）。sortは複数キー指定可（R-0092複合ソート） */
export function useProjectsPaged(
  page: number,
  filters?: { status?: string; q?: string; customer_id?: number },
  sort?: SortParam[],
) {
  return useQuery({
    queryKey: [KEY, 'paged', page, filters, sort?.map(s => `${s.key}:${s.dir}`).join(',')],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), per_page: '50' });
      if (filters?.status) params.set('status', filters.status);
      if (filters?.q) params.set('q', filters.q);
      if (filters?.customer_id) params.set('customer_id', String(filters.customer_id));
      if (sort && sort.length > 0) {
        params.set('sort', sort.map(s => s.key).join(','));
        params.set('order', sort.map(s => s.dir).join(','));
      }
      return api.get<PaginatedResponse<Project>>(`/projects?${params}`);
    },
    placeholderData: keepPreviousData,
  });
}

export function useProject(id: number) {
  return useQuery({
    queryKey: [KEY, id],
    queryFn: () => api.get<Project>(`/projects/${id}`),
    enabled: id > 0,
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ProjectInput) => api.post<Project>('/projects', data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: [KEY] }); },
  });
}

export function useUpdateProject(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ProjectInput) => api.put<Project>(`/projects/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [KEY] });
      queryClient.invalidateQueries({ queryKey: [KEY, id] });
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete<void>(`/projects/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: [KEY] }); },
  });
}

/** R-0095: 案件の完全削除（伝票・明細も含めて完全に削除する）。請求書に紐づく伝票がある場合は409エラー */
export function useHardDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete<{ deleted: boolean }>(`/projects/${id}?hard=1`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: [KEY] }); },
  });
}

export function useUploadProjectImage(projectId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('image', file);
      const res = await fetch(`/contents/Beaver/api/projects/${projectId}/images`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
      return res.json() as Promise<ProjectImage>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [KEY, projectId] });
    },
  });
}

export function useDeleteProjectImage(projectId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (imageId: number) => api.delete<void>(`/projects/${projectId}/images/${imageId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [KEY, projectId] });
    },
  });
}
