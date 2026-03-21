import { useQuery } from '@tanstack/react-query';
import { api } from './client';

export interface CatalogItem {
  id: string;
  name: string;
  cost_body?: number;
  cost_hardware?: number;
  cost_glass?: number;
}

export interface CatalogAggregation {
  code: string;
  name: string;
  measureType: 'money' | 'time';
  total: number;
}

export interface CatalogItemExport {
  aggregations: CatalogAggregation[];
}

export function useCatalogItems(q: string) {
  return useQuery({
    queryKey: ['catalog-items', q],
    queryFn: () => api.get<CatalogItem[]>(`/catalog-proxy/items${q ? `?q=${encodeURIComponent(q)}` : ''}`),
    enabled: true,
    staleTime: 1000 * 60,
  });
}

export async function fetchCatalogItemExport(id: string): Promise<CatalogItemExport> {
  return api.get<CatalogItemExport>(`/catalog-proxy/items/${id}/access-export`);
}
