import { useQuery } from '@tanstack/react-query';
import { api } from './client';

/** R-0143 A-B-05: 請求・入金編集の封印フラグ取得 */
export function useBillingEditEnabled() {
  return useQuery({
    queryKey: ['billing-edit-enabled'],
    queryFn: () => api.get<{ billing_edit_enabled: boolean }>('/settings/billing-edit-enabled'),
  });
}
