import { describe, it, expect } from 'vitest';
import { buildLedgerCloneDraft } from '../ledgerClone';
import type { TateguItem } from '../../types/tateguItem';

const source = {
  id: 9,
  code: '00009',
  name: '障子',
  description: '備考',
  unit: '枚',
  memo: null,
  base_catalog_item_name: '元カタログ',
  status: 'archived',
  last_synced_at: '2026-10-01 00:00:00',
  building_image_path: 'drawing.png',
  cost_body: 100,
  cost_hardware: 20,
  cost_glass: 30,
  cost_factory_hours: 2,
  cost_site_hours: 1,
  cost_labor_rate: 3000,
  created_at: 'x',
  updated_at: 'y',
  cost_lines: [
    { id: 1, tategu_item_id: 9, category_code: 'MAIN', name: '桟', quantity: 2, unit_cost: 50, amount: 100, source: 'wood_calc', sort_order: 0 },
    { id: 2, tategu_item_id: 9, category_code: 'GLASS', name: '板ガラス', quantity: 1, unit_cost: 30, amount: 30, source: 'manual', sort_order: 1 },
  ],
  labor_lines: [
    { id: 3, tategu_item_id: 9, process_name: '組立', category_code: 'FACTORY_TIME', work_hours: 2, labor_rate: 3000, amount: 6000, sort_order: 0 },
  ],
} as unknown as TateguItem;

describe('buildLedgerCloneDraft (R-0250)', () => {
  it('品名・備考・単位と原価を写し、製品№は空にする', () => {
    const d = buildLedgerCloneDraft(source);
    expect(d.form).toMatchObject({ name: '障子', description: '備考', unit: '枚', cost_body: 100, cost_hardware: 20, cost_glass: 30 });
    expect(d.form.code).toBeNull();
    expect(d.sourceCode).toBe('00009');
  });

  it('同期の状態・製品図・使用不可の状態・id は持ち越さない', () => {
    const d = buildLedgerCloneDraft(source);
    for (const key of ['id', 'status', 'last_synced_at', 'building_image_path', 'created_at', 'updated_at']) {
      expect(d.form).not.toHaveProperty(key);
    }
  });

  it('材料費・労務費の行を並びごと写し、木材原価計算の行は手入力の行にする', () => {
    const d = buildLedgerCloneDraft(source);
    expect(d.costLines.map(l => [l.name, l.source, l.sort_order])).toEqual([['桟', 'manual', 0], ['板ガラス', 'manual', 1]]);
    expect(d.costLines[0]).not.toHaveProperty('id');
    expect(d.laborLines).toEqual([{ process_name: '組立', category_code: 'FACTORY_TIME', work_hours: 2, labor_rate: 3000, amount: 6000, sort_order: 0 }]);
  });
});
