import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';

/** R-0143 A-B-05: 請求・入金編集の封印フラグ取得 */
export function useBillingEditEnabled() {
  return useQuery({
    queryKey: ['billing-edit-enabled'],
    queryFn: () => api.get<{ billing_edit_enabled: boolean }>('/settings/billing-edit-enabled'),
  });
}

export interface CompanySettings {
  default_labor_rate?: number | null;
  [key: string]: unknown;
}

/** 自社情報（company_settings）取得 */
export function useCompanySettings() {
  return useQuery({
    queryKey: ['company-settings'],
    queryFn: () => api.get<CompanySettings>('/settings'),
  });
}

/** R-0174: 新しい明細行の労務単価の初期値。読み込めていないときは0 */
export function useDefaultLaborRate() {
  return Number(useCompanySettings().data?.default_labor_rate) || 0;
}

/** 自社情報（company_settings）更新 */
export function useUpdateCompanySettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<CompanySettings>) => api.put<CompanySettings>('/settings', data),
    onSuccess: data => qc.setQueryData(['company-settings'], data),
  });
}
