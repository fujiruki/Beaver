import { describe, expect, it } from 'vitest';
import { buildVoucherMarkdown } from '../voucherMarkdown';

const line = {
  line_no: 1, line_type: 'normal' as const, item_name: '木製ドア', location_name: '玄関', quantity: 2,
  tategu_item_id: 10, line_total: 200000, memo: '備考', tax_category: 'taxable', cost_labor_rate: 5000,
  costs: [
    { category_code: 'MAIN', category_name: '本体', measure_type: 'money' as const, value: 30000, sort_order: 1 },
    { category_code: 'FACTORY_TIME', category_name: '工場時間', measure_type: 'time' as const, value: 2, sort_order: 2 },
  ],
};
const form = {
  voucher_type: 'estimate' as const, status: 'draft' as const, voucher_date: '2026-11-02',
  tax_input_type: 'exclusive' as const, consumption_tax_type: '外税/伝票計', description: '玄関工事',
  lines: [line, { ...line, line_no: 2 }],
};
const ledger = {
  id: 10, item_no: 'T-001', name: '木製ドア', notes: '台帳備考',
  cost_lines: [{ category_code: 'MAIN', name: 'オーデ', quantity: 2, unit_cost: 1000, amount: 2000 }],
  labor_lines: [{ category_code: 'FACTORY_TIME', process_name: '組立', work_hours: 1, labor_rate: 5000, amount: 5000 }],
};

describe('R-0233 伝票のAI向けMarkdown', () => {
  it('見出し・明細・合計・重複しない台帳の節を金額書式付きで作る', () => {
    const markdown = buildVoucherMarkdown({ form, voucherNo: 'E-001', customerName: '得意先A', projectName: '案件A', ledgers: new Map([[10, ledger]]) });
    expect(markdown).toContain('# 見積 E-001');
    expect(markdown).toContain('| No | 品名 | 取付場所 |');
    expect(markdown).toContain('¥200,000');
    expect(markdown).toContain('## 合計');
    expect(markdown).toContain('## 製品台帳 T-001 木製ドア');
    expect(markdown.match(/## 製品台帳/g)).toHaveLength(1);
    expect(markdown).toContain('| 本体 | オーデ | 2 | ¥1,000 | ¥2,000 |');
  });

  it('読み込めなかった台帳を明記して残りを作る', () => {
    const markdown = buildVoucherMarkdown({ form, voucherNo: '', customerName: '', projectName: '', ledgers: new Map([[10, null]]) });
    expect(markdown).toContain('## 製品台帳 ID:10');
    expect(markdown).toContain('（読み込めませんでした）');
  });

  it('値引きの行があれば利益から引く', () => {
    const discount = { ...line, line_no: 3, line_type: 'discount' as const, line_total: 20000, tategu_item_id: null, costs: [] };
    const markdown = buildVoucherMarkdown({ form: { ...form, lines: [...form.lines, discount] }, voucherNo: '', customerName: '', projectName: '', ledgers: new Map() });
    expect(markdown).toContain('- 利益: ¥220,000');
  });
});
