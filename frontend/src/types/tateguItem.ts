export interface CostBreakdownLine {
  id: number;
  tategu_item_id: number;
  category_code: string;
  category_name: string;
  measure_type: 'money' | 'time';
  value: number;
  sort_order: number;
}

export interface TateguItem {
  id: number;
  item_code: string;
  name: string;
  spec: string | null;
  base_catalog_item_name: string | null;
  cost_body: number;
  cost_hardware: number;
  cost_glass: number;
  cost_factory_hours: number;
  cost_site_hours: number;
  cost_labor_rate: number;
  unit: string | null;
  memo: string | null;
  created_at: string;
  updated_at: string;
  cost_breakdown?: CostBreakdownLine[];
}

export type TateguItemInput = Omit<TateguItem, 'id' | 'created_at' | 'updated_at'>;
