import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { ProjectSchedule, ProjectScheduleInput } from '../types/projectSchedule';

const KEY = 'project-schedules';

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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useUpdateProjectSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: number } & Partial<ProjectScheduleInput>) =>
      api.put<ProjectSchedule>(`/project-schedules/${id}`, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useDeleteProjectSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete<void>(`/project-schedules/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}
