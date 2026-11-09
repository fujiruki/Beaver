import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { TateguItem } from '../types/tateguItem';

const KEY = 'ledgerCatalogs';

export interface LedgerCatalog {
  id: number;
  name: string;
  sort_order: number;
  item_count: number;
}

export function useLedgerCatalogs(enabled = true) {
  return useQuery({
    queryKey: [KEY],
    queryFn: () => api.get<LedgerCatalog[]>('/ledger-catalogs'),
    enabled,
  });
}

export function useLedgerCatalogItems(catalogId: number) {
  return useQuery({
    queryKey: [KEY, catalogId, 'items'],
    queryFn: () => api.get<TateguItem[]>(`/ledger-catalogs/${catalogId}/items`),
    enabled: catalogId > 0,
  });
}

function useInvalidate() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: [KEY] });
}

export function useCreateLedgerCatalog() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (name: string) => api.post<LedgerCatalog>('/ledger-catalogs', { name }),
    onSuccess: invalidate,
  });
}

export function useUpdateLedgerCatalog() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (c: { id: number; name: string; sort_order: number }) =>
      api.put(`/ledger-catalogs/${c.id}`, { name: c.name, sort_order: c.sort_order }),
    onSuccess: invalidate,
  });
}

export function useDeleteLedgerCatalog() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: number) => api.delete<unknown>(`/ledger-catalogs/${id}`),
    onSuccess: invalidate,
  });
}

export function useSaveLedgerCatalogItems() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (v: { catalogId: number; ids: number[] }) =>
      api.put(`/ledger-catalogs/${v.catalogId}/items`, { tategu_item_ids: v.ids }),
    onSuccess: invalidate,
  });
}

/** 既存の中身の末尾に台帳を足して保存する */
export function useAddToLedgerCatalog() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (v: { catalogId: number; itemId: number }) => {
      const current = await api.get<TateguItem[]>(`/ledger-catalogs/${v.catalogId}/items`);
      const ids = current.map(i => i.id).filter(id => id !== v.itemId);
      return api.put(`/ledger-catalogs/${v.catalogId}/items`, { tategu_item_ids: [...ids, v.itemId] });
    },
    onSuccess: invalidate,
  });
}
