import { describe, it, expect } from 'vitest';
import { calcVoucherTotal, calcPriceFromProfit } from '../voucherCalc';

const line = (n: number) => ({ line_type: 'normal' as const, line_total: n, tax_category: 'taxable' });

describe('R-0269 税額の丸め', () => {
  it('内税 165円・10% → 税15 / 11000円 → 税1000', () => {
    expect(calcVoucherTotal([line(165)], 'inclusive', 0.1).tax_amount).toBe(15);
    expect(calcVoucherTotal([line(11000)], 'inclusive', 0.1).tax_amount).toBe(1000);
  });

  it.each([[0.1, 10, 110], [0.08, 8, 108]])('税率%s: 1〜1,000,000円の全額が整数計算と一致', (rate, pct, incl) => {
    const bad: number[] = [];
    for (let n = 1; n <= 1_000_000; n++) {
      const inc = calcVoucherTotal([line(n)], 'inclusive', rate).tax_amount;
      const exc = calcVoucherTotal([line(n)], 'exclusive', rate).tax_amount;
      if (inc !== Math.floor((n * pct) / incl) || exc !== Math.floor((n * pct) / 100)) bad.push(n);
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });

  it('calcPriceFromProfit 原価100・利益率0.9 → 1000', () => {
    const l = { cost_body: 100, cost_hardware: 0, cost_glass: 0, cost_factory_hours: 0, cost_site_hours: 0, cost_labor_rate: 0 };
    expect(calcPriceFromProfit(l, 0.9).line_total).toBe(1000);
  });
});
