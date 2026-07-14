export interface CostBreakdownLine {
  id: number;
  tategu_item_id: number;
  category_code: string;
  category_name: string;
  measure_type: 'money' | 'time';
  value: number;
  sort_order: number;
}

export interface CostLine {
  id: number;
  tategu_item_id: number;
  category_code: string;
  name: string;
  quantity: number;
  unit_cost: number;
  amount: number;
  source: 'manual' | 'wood_calc';
  sort_order: number;
}

export interface LaborLine {
  id: number;
  tategu_item_id: number;
  process_name: string;
  category_code: string;
  work_hours: number;
  labor_rate: number;
  amount: number;
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
  cost_lines?: CostLine[];
  labor_lines?: LaborLine[];
}

export type TateguItemInput = Omit<TateguItem, 'id' | 'created_at' | 'updated_at'>;
export type TateguItemUpdateInput = Partial<TateguItemInput>;
