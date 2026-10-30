import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { ProjectSchedule, ProjectScheduleInput } from '../types/projectSchedule';

const KEY = 'project-schedules';

// 製作の予定を変えるとサーバーが projects.start_date の写しを入れ直すため、案件の一覧も取り直す
function invalidateSchedules(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: [KEY] });
  queryClient.invalidateQueries({ queryKey: ['projects'] });
}

export function useAllProjectSchedules() {
  return useQuery({
    queryKey: [KEY],
    queryFn: () => api.get<ProjectSchedule[]>('/project-schedules'),
  });
}

export function useProjectSchedules(projectId: number) {
  return useQuery({
    queryKey: [KEY, 'project', projectId],
    queryFn: () => api.get<ProjectSchedule[]>(`/projects/${projectId}/schedules`),
    enabled: projectId > 0,
  });
}

export function useCreateProjectSchedule(projectId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ProjectScheduleInput) =>
      api.post<ProjectSchedule>(`/projects/${projectId}/schedules`, data),
    onSuccess: created => {
      queryClient.setQueryData<ProjectSchedule[]>([KEY, 'project', projectId], old =>
        Array.isArray(old) && !old.some(s => s.id === created.id) ? [...old, created] : old);
      invalidateSchedules(queryClient);
    },
  });
}

export function useCreateProjectScheduleFor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, ...data }: { projectId: number } & ProjectScheduleInput) =>
      api.post<ProjectSchedule>(`/projects/${projectId}/schedules`, data),
    onSuccess: () => invalidateSchedules(queryClient),
  });
}

export function useUpdateProjectSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: number } & Partial<ProjectScheduleInput>) =>
      api.put<ProjectSchedule>(`/project-schedules/${id}`, data),
    onSuccess: () => invalidateSchedules(queryClient),
  });
}

export function useDeleteProjectSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete<void>(`/project-schedules/${id}`),
    onSuccess: () => invalidateSchedules(queryClient),
  });
}
