import { useQuery } from '@tanstack/react-query';
import { api } from './client';

export interface SyncStatus {
  app_id: string;
  last_synced_at: string | null;
  source: string | null;
}

/** R-0143 A-B-06: AccessTategu連携の最終同期時刻・同期先AppID取得 */
export function useSyncStatus() {
  return useQuery({
    queryKey: ['sync-status'],
    queryFn: () => api.get<SyncStatus>('/sync/status'),
  });
}
