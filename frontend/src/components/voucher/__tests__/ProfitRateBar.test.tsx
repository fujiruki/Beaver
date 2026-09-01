import { describe, it, expect } from 'vitest';
import { calcCategorySellPrices } from '../ProfitRateBar';
import type { AggregationCategoryMaster } from '../../../api/aggregationCategories';
import type { LineCategoryValue } from '../../../types/voucher';

function cat(overrides: Partial<AggregationCategoryMaster> & { merge_into_price_code?: string | null }): AggregationCategoryMaster {
  return {
    id: 1,
    code: 'X',
    name: 'X',
    measure_type: 'money',
    sort_order: 1,
    is_active: 1,
    synced_at: '',
    ...overrides,
  };
}

describe('calcCategorySellPrices', () => {
  it('本体原価とmergeされる労務費は合算してから一度だけ丸める', () => {
    const categories = [
      cat({ code: 'MAIN', name: '本体', measure_type: 'money', sort_order: 1 }),
      cat({ code: 'FACTORY_TIME', name: '工場時間', measure_type: 'time', sort_order: 4, merge_into_price_code: 'MAIN' }),
    ];
    const costs: LineCategoryValue[] = [
      { category_code: 'MAIN', category_name: '本体', measure_type: 'money', value: 1230, sort_order: 1 },
      { category_code: 'FACTORY_TIME', category_name: '工場時間', measure_type: 'time', value: 2, sort_order: 4 },
    ];
    const laborRate = 170; // 2h * 170 = 340円

    const result = calcCategorySellPrices(costs, categories, laborRate, 0.3);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ category_code: 'MAIN', value: 2200 });
  });

  it('労務費がmergeされないmoney型区分は個別に丸めたまま', () => {
    const categories = [
      cat({ code: 'HARDWARE', name: '金物', measure_type: 'money', sort_order: 2 }),
    ];
    const costs: LineCategoryValue[] = [
      { category_code: 'HARDWARE', category_name: '金物', measure_type: 'money', value: 500, sort_order: 2 },
    ];

    const result = calcCategorySellPrices(costs, categories, 0, 0.3);

    // roundToHundred(Math.ceil(500 / 0.7)) = roundToHundred(715) = 700
    expect(result).toEqual([
      { category_code: 'HARDWARE', category_name: '金物', measure_type: 'money', value: 700, sort_order: 2 },
    ]);
  });

  it('line_total はquantity倍された新しい売値を元に計算される', () => {
    const categories = [
      cat({ code: 'MAIN', name: '本体', measure_type: 'money', sort_order: 1 }),
      cat({ code: 'FACTORY_TIME', name: '工場時間', measure_type: 'time', sort_order: 4, merge_into_price_code: 'MAIN' }),
    ];
    const costs: LineCategoryValue[] = [
      { category_code: 'MAIN', category_name: '本体', measure_type: 'money', value: 1230, sort_order: 1 },
      { category_code: 'FACTORY_TIME', category_name: '工場時間', measure_type: 'time', value: 2, sort_order: 4 },
    ];

    const result = calcCategorySellPrices(costs, categories, 170, 0.3);
    const quantity = 3;
    const lineTotal = result.reduce((s, p) => s + p.value, 0) * quantity;

    expect(lineTotal).toBe(2200 * 3);
  });
});
