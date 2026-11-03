import { describe, expect, it } from 'vitest';
import { buildVoucherMarkdown } from '../voucherMarkdown';

const form = {
  voucher_type: 'estimate' as const, status: 'draft' as const, voucher_date: '2026-11-03',
  tax_input_type: 'exclusive' as const, consumption_tax_type: '外税/伝票計', description: '玄関工事',
  lines: [],
};
const build = (hidden_note?: string | null) =>
  buildVoucherMarkdown({ form: { ...form, hidden_note }, voucherNo: 'E-1', customerName: '', projectName: '', ledgers: new Map() });

describe('R-0241 AI宛にコピーの非表示記録', () => {
  it('非表示記録があれば「非表示記録（社内メモ）」の見出しで出す', () => {
    const markdown = build('値引き余地あり');
    expect(markdown).toContain('非表示記録（社内メモ）');
    expect(markdown).toContain('値引き余地あり');
  });

  it('空なら出さない', () => {
    expect(build(null)).not.toContain('非表示記録');
    expect(build('')).not.toContain('非表示記録');
  });
});
