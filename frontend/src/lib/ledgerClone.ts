import type { CostLine, LaborLine, TateguItem } from '../types/tateguItem';

export type LedgerCloneForm = {
  code: null;
  name: string;
  description: string | null;
  unit: string | null;
  memo: string | null;
  base_catalog_item_name: null;
  cost_body: number;
  cost_hardware: number;
  cost_glass: number;
  cost_factory_hours: number;
  cost_site_hours: number;
  cost_labor_rate: number;
};

export type CloneCostLine = Omit<CostLine, 'id' | 'tategu_item_id'>;
export type CloneLaborLine = Omit<LaborLine, 'id' | 'tategu_item_id'>;

/** R-0250: 製品№・同期の状態・製品図・使用不可の状態は写さず、木材原価計算の行は手入力の行にする */
export function buildLedgerCloneDraft(src: TateguItem) {
  const form: LedgerCloneForm = {
    code: null,
    name: src.name,
    description: src.description,
    unit: src.unit,
    memo: src.memo,
    base_catalog_item_name: null,
    cost_body: src.cost_body,
    cost_hardware: src.cost_hardware,
    cost_glass: src.cost_glass,
    cost_factory_hours: src.cost_factory_hours,
    cost_site_hours: src.cost_site_hours,
    cost_labor_rate: src.cost_labor_rate,
  };
  const costLines: CloneCostLine[] = (src.cost_lines ?? []).map((l, i) => ({
    category_code: l.category_code,
    name: l.name,
    quantity: l.quantity,
    unit_cost: l.unit_cost,
    amount: l.amount,
    source: 'manual',
    sort_order: l.sort_order ?? i,
  }));
  const laborLines: CloneLaborLine[] = (src.labor_lines ?? []).map((l, i) => ({
    process_name: l.process_name,
    category_code: l.category_code,
    work_hours: l.work_hours,
    labor_rate: l.labor_rate,
    amount: l.amount,
    sort_order: l.sort_order ?? i,
  }));
  return { form, costLines, laborLines, sourceCode: src.code };
}
