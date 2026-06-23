import { describe, it, expect } from 'vitest';
import {
  calcManufactureCost,
  calcVoucherTotal,
  calcPriceFromProfit,
  calcMaterialCostDynamic,
  calcLaborCostDynamic,
  calcManufactureCostDynamic,
  calcLineTotalDynamic,
  calcProfitSummaryDynamic,
} from '../voucherCalc';
import type { LineCategoryValue } from '../../types/voucher';

describe('calcManufactureCost', () => {
  it('全フィールド0 → 0', () => {
    expect(calcManufactureCost({
      cost_body: 0, cost_hardware: 0, cost_glass: 0,
      cost_factory_hours: 0, cost_site_hours: 0, cost_labor_rate: 0,
    })).toBe(0);
  });

  it('材料費のみ → 合計', () => {
    expect(calcManufactureCost({
      cost_body: 10000, cost_hardware: 5000, cost_glass: 3000,
      cost_factory_hours: 0, cost_site_hours: 0, cost_labor_rate: 0,
    })).toBe(18000);
  });

  it('工場時間あり → 材料費 + 時間 × 労務単価', () => {
    expect(calcManufactureCost({
      cost_body: 20000, cost_hardware: 0, cost_glass: 0,
      cost_factory_hours: 4, cost_site_hours: 2, cost_labor_rate: 3000,
    })).toBe(38000); // 20000 + (4+2)*3000
  });

  it('NaN/undefinedフィールドは0扱い', () => {
    expect(calcManufactureCost({
      cost_body: NaN as number,
      cost_hardware: undefined as unknown as number,
      cost_glass: 5000,
      cost_factory_hours: 0,
      cost_site_hours: 0,
      cost_labor_rate: 0,
    })).toBe(5000);
  });
});

describe('calcVoucherTotal - 税抜入力 (exclusive)', () => {
  it('課税行1本 ¥100,000 → tax=10,000, total=110,000', () => {
    const result = calcVoucherTotal(
      [{ line_type: 'normal', line_total: 100000, tax_category: 'taxable' }],
      'exclusive',
      0.10,
    );
    expect(result.subtotal_taxable).toBe(100000);
    expect(result.tax_amount).toBe(10000);
    expect(result.total).toBe(110000);
  });

  it('非課税行1本 → tax=0', () => {
    const result = calcVoucherTotal(
      [{ line_type: 'normal', line_total: 50000, tax_category: 'non_taxable' }],
      'exclusive',
      0.10,
    );
    expect(result.tax_amount).toBe(0);
    expect(result.total).toBe(50000);
  });

  it('割引行 → totalから減算', () => {
    const result = calcVoucherTotal(
      [
        { line_type: 'normal', line_total: 100000, tax_category: 'taxable' },
        { line_type: 'discount', line_total: 10000, tax_category: 'taxable' },
      ],
      'exclusive',
      0.10,
    );
    expect(result.subtotal_taxable).toBe(90000);
    expect(result.tax_amount).toBe(9000);
    expect(result.total).toBe(99000);
  });

  it('消費税端数切り捨て（¥3,333 → tax=333）', () => {
    const result = calcVoucherTotal(
      [{ line_type: 'normal', line_total: 3333, tax_category: 'taxable' }],
      'exclusive',
      0.10,
    );
    expect(result.tax_amount).toBe(333);
    expect(result.total).toBe(3666);
  });

  it('subtotal行は計算に影響しない', () => {
    const result = calcVoucherTotal(
      [
        { line_type: 'normal', line_total: 100000, tax_category: 'taxable' },
        { line_type: 'subtotal', line_total: 100000, tax_category: 'taxable' },
      ],
      'exclusive',
      0.10,
    );
    expect(result.subtotal_taxable).toBe(100000);
  });
});

describe('calcVoucherTotal - 税込入力 (inclusive)', () => {
  it('¥110,000税込 → taxable=100,000, tax=10,000', () => {
    const result = calcVoucherTotal(
      [{ line_type: 'normal', line_total: 110000, tax_category: 'taxable' }],
      'inclusive',
      0.10,
    );
    expect(result.subtotal_taxable).toBe(100000);
    expect(result.tax_amount).toBe(10000);
    expect(result.total).toBe(110000);
  });

  it('端数あり → floor(税込×10/110)で税額導出', () => {
    const result = calcVoucherTotal(
      [{ line_type: 'normal', line_total: 110010, tax_category: 'taxable' }],
      'inclusive',
      0.10,
    );
    expect(result.subtotal_taxable).toBe(100010);
    expect(result.tax_amount).toBe(10000);
    expect(result.total).toBe(110010);
  });

  it('税込10005 → tax=909, taxable=9096', () => {
    const result = calcVoucherTotal(
      [{ line_type: 'normal', line_total: 10005, tax_category: 'taxable' }],
      'inclusive',
      0.10,
    );
    expect(result.subtotal_taxable).toBe(9096);
    expect(result.tax_amount).toBe(909);
    expect(result.total).toBe(10005);
  });

  it('税込100000 → tax=9090, taxable=90910', () => {
    const result = calcVoucherTotal(
      [{ line_type: 'normal', line_total: 100000, tax_category: 'taxable' }],
      'inclusive',
      0.10,
    );
    expect(result.subtotal_taxable).toBe(90910);
    expect(result.tax_amount).toBe(9090);
    expect(result.total).toBe(100000);
  });
});

describe('calcPriceFromProfit', () => {
  const baseLine = {
    cost_body: 50000, cost_hardware: 0, cost_glass: 0,
    cost_factory_hours: 0, cost_site_hours: 0, cost_labor_rate: 0,
  };

  it('原価¥50,000 + 利益率30% → 売価¥71,429', () => {
    const result = calcPriceFromProfit(baseLine, 0.3);
    expect(result.line_total).toBe(71429);
  });

  it('利益率0% → 売価=原価', () => {
    const result = calcPriceFromProfit(baseLine, 0);
    expect(result.line_total).toBe(50000);
  });

  it('原価0 → 売価0（ゼロ除算回避）', () => {
    const result = calcPriceFromProfit({
      cost_body: 0, cost_hardware: 0, cost_glass: 0,
      cost_factory_hours: 0, cost_site_hours: 0, cost_labor_rate: 0,
    }, 0.3);
    expect(result.line_total).toBe(0);
  });
});

// ---- 動的集計区分 ----

const moneyOnly: LineCategoryValue[] = [
  { category_code: 'body',     category_name: '本体',   measure_type: 'money', value: 30000, sort_order: 0 },
  { category_code: 'hardware', category_name: '金物',   measure_type: 'money', value: 10000, sort_order: 1 },
  { category_code: 'glass',    category_name: 'ガラス', measure_type: 'money', value: 5000,  sort_order: 2 },
];

const timeOnly: LineCategoryValue[] = [
  { category_code: 'factory_hours', category_name: '工場時間', measure_type: 'time', value: 4, sort_order: 3 },
  { category_code: 'site_hours',    category_name: '現場時間', measure_type: 'time', value: 2, sort_order: 4 },
];

const mixed: LineCategoryValue[] = [...moneyOnly, ...timeOnly];

describe('calcMaterialCostDynamic', () => {
  it('money型のみ合計 × 数量', () => {
    expect(calcMaterialCostDynamic(moneyOnly, 2)).toBe(90000); // (30000+10000+5000)*2
  });

  it('time型は含まない', () => {
    expect(calcMaterialCostDynamic(timeOnly, 1)).toBe(0);
  });

  it('空配列 → 0', () => {
    expect(calcMaterialCostDynamic([], 3)).toBe(0);
  });
});

describe('calcLaborCostDynamic', () => {
  it('time合計 × laborRate × quantity', () => {
    expect(calcLaborCostDynamic(timeOnly, 3000, 1)).toBe(18000); // (4+2)*3000*1
  });

  it('数量2倍で2倍', () => {
    expect(calcLaborCostDynamic(timeOnly, 3000, 2)).toBe(36000);
  });

  it('money型は含まない', () => {
    expect(calcLaborCostDynamic(moneyOnly, 5000, 1)).toBe(0);
  });
});

describe('calcManufactureCostDynamic', () => {
  it('材料費 + 労務費', () => {
    // 材料: 45000, 労務: 6*3000=18000 → 63000 (数量1)
    expect(calcManufactureCostDynamic(mixed, 3000, 1)).toBe(63000);
  });

  it('数量2 → 2倍', () => {
    expect(calcManufactureCostDynamic(mixed, 3000, 2)).toBe(126000);
  });
});

describe('calcLineTotalDynamic', () => {
  it('全value合計 × quantity', () => {
    const prices: LineCategoryValue[] = [
      { category_code: 'body', category_name: '本体', measure_type: 'money', value: 50000, sort_order: 0 },
      { category_code: 'glass', category_name: 'ガラス', measure_type: 'money', value: 10000, sort_order: 1 },
    ];
    expect(calcLineTotalDynamic(prices, 3)).toBe(180000); // (50000+10000)*3
  });
});

describe('calcProfitSummaryDynamic', () => {
  it('利益・利益率・粗利率・作業時間を正しく計算', () => {
    const lines = [
      {
        costs: mixed,
        cost_labor_rate: 3000,
        quantity: 1,
        line_type: 'normal' as const,
        line_total: 80000,
      },
    ];
    const result = calcProfitSummaryDynamic(lines, 80000);
    // 材料原価: 45000, 労務: 18000, 製造原価: 63000
    expect(result.grossProfit).toBe(17000);      // 80000 - 63000
    expect(result.grossProfitRate).toBeCloseTo(0.2125);
    expect(result.grossMarginRate).toBeCloseTo((80000 - 45000) / 80000);
    expect(result.totalWorkHours).toBe(6);       // 4+2
    expect(result.profitPerHour).toBeCloseTo(17000 / 6);
  });

  it('subtotal行は無視される', () => {
    const lines = [
      { costs: moneyOnly, cost_labor_rate: 0, quantity: 1, line_type: 'normal' as const, line_total: 60000 },
      { costs: moneyOnly, cost_labor_rate: 0, quantity: 1, line_type: 'subtotal' as const, line_total: 60000 },
    ];
    const result = calcProfitSummaryDynamic(lines, 60000);
    expect(result.grossProfit).toBe(15000); // 60000 - 45000
  });
});
