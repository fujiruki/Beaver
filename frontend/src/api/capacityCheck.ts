import { useQuery } from '@tanstack/react-query';
import { api } from './client';
import type { CapacityCheckResponse } from '../types/capacityCheck';

/** Youkan容量判定（R-0118）。判定失敗はレスポンス内の ok:false で表現されるため retry しない */
export function useCapacityCheck(projectId: number) {
  return useQuery({
    queryKey: ['capacity-check', projectId],
    queryFn: () => api.get<CapacityCheckResponse>(`/projects/${projectId}/capacity-check`),
    staleTime: 60_000,
    retry: false,
    enabled: projectId > 0,
  });
}
