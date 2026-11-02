import { calcProfitSummaryDynamic, calcVoucherTotal } from './voucherCalc';
import type { LineCategoryValue, TaxInputType, VoucherStatus, VoucherType } from '../types/voucher';

type MarkdownLine = {
  line_no: number; line_type: 'normal' | 'discount' | 'subtotal'; item_name?: string | null;
  location_name?: string | null; quantity: number; unit?: string | null; tategu_item_id?: number | null;
  line_total: number; memo?: string | null; tax_category: string; cost_labor_rate: number; costs: LineCategoryValue[];
};
type MarkdownForm = {
  voucher_type: VoucherType; status: VoucherStatus; voucher_date: string; tax_input_type: TaxInputType;
  consumption_tax_type: string; description?: string | null; lines: MarkdownLine[];
};
type Ledger = Record<string, any>;

const money = (value: number) => `¥${Math.round(value).toLocaleString('ja-JP')}`;
const cell = (value: unknown) => value == null ? '' : String(value).replaceAll('|', '\\|').replaceAll('\n', '<br>');
const statusLabels: Record<string, string> = { draft: '下書き', submitted: '提出済', approved: '承認済', billed: '請求済', void: '取消' };
const categoryName = (code: string) => ({ MAIN: '本体', HARDWARE: '金物', GLASS: 'ガラス', FACTORY_TIME: '工場時間', SITE_TIME: '現場時間' }[code] ?? code);

export function buildVoucherMarkdown({ form, voucherNo, customerName, projectName, ledgers }: {
  form: MarkdownForm; voucherNo: string; customerName: string; projectName: string; ledgers: Map<number, Ledger | null>;
}): string {
  const type = form.voucher_type === 'estimate' ? '見積' : '売上';
  const totals = calcVoucherTotal(form.lines, form.tax_input_type, 0.1);
  const profit = calcProfitSummaryDynamic(form.lines, totals.total - totals.tax_amount);
  const parts = [
    `# ${type}${voucherNo ? ` ${voucherNo}` : ''}`,
    '',
    `- 日付: ${cell(form.voucher_date)}`,
    `- 得意先: ${cell(customerName)}`,
    `- 案件: ${cell(projectName)}`,
    `- 摘要: ${cell(form.description)}`,
    `- ステータス: ${statusLabels[form.status] ?? form.status}`,
    `- 税の扱い: ${form.tax_input_type === 'exclusive' ? '税抜' : '税込'}（${cell(form.consumption_tax_type)}）`,
    '', '## 明細',
    '', '| No | 品名 | 取付場所 | 数量 | 単位 | 売値単価 | 売値金額 | 原価 | 作業時間 | 利益 | 備考 | 製品№ |',
    '|---:|---|---|---:|---|---:|---:|---:|---:|---:|---|---|',
  ];
  for (const line of form.lines) {
    const material = line.costs.filter(c => c.measure_type === 'money').reduce((s, c) => s + (c.value || 0), 0) * line.quantity;
    const hours = line.costs.filter(c => c.measure_type === 'time').reduce((s, c) => s + (c.value || 0), 0) * line.quantity;
    const cost = material + hours * line.cost_labor_rate;
    const ledger = line.tategu_item_id ? ledgers.get(line.tategu_item_id) : null;
    const ledgerNo = ledger?.code ?? ledger?.item_no ?? (line.tategu_item_id ? `ID:${line.tategu_item_id}` : '');
    const name = line.line_type === 'discount' ? '値引' : line.line_type === 'subtotal' ? '小計' : line.item_name;
    parts.push(`| ${line.line_no} | ${cell(name)} | ${cell(line.location_name)} | ${line.quantity ?? ''} | ${cell(line.unit)} | ${line.quantity ? money(line.line_total / line.quantity) : ''} | ${money(line.line_total)} | ${money(cost)} | ${hours || ''} | ${money(line.line_total - cost)} | ${cell(line.memo)} | ${cell(ledgerNo)} |`);
  }
  parts.push('', '## 合計', '', `- 税抜: ${money(totals.total - totals.tax_amount)}`, `- 消費税: ${money(totals.tax_amount)}`, `- 税込: ${money(totals.total)}`, `- 原価合計: ${money(totals.total - totals.tax_amount - profit.grossProfit)}`, `- 利益: ${money(profit.grossProfit)}`, `- 利益率: ${profit.grossProfitRate == null ? '' : `${(profit.grossProfitRate * 100).toFixed(1)}%`}`, `- 作業時間合計: ${profit.totalWorkHours.toFixed(1)} h`);
  for (const id of [...new Set(form.lines.map(line => line.tategu_item_id).filter((value): value is number => Boolean(value)))]) {
    const ledger = ledgers.get(id);
    const no = ledger?.code ?? ledger?.item_no ?? `ID:${id}`;
    parts.push('', `## 製品台帳 ${cell(no)}${ledger?.name ? ` ${cell(ledger.name)}` : ''}`, '');
    if (!ledger) { parts.push('（読み込めませんでした）'); continue; }
    parts.push(`- 備考: ${cell(ledger.memo ?? ledger.notes ?? ledger.description)}`, '', '### 材料費', '', '| 区分 | 名称 | 数量 | 単価 | 金額 |', '|---|---|---:|---:|---:|');
    for (const row of ledger.cost_lines ?? []) parts.push(`| ${categoryName(row.category_code)} | ${cell(row.name)} | ${row.quantity ?? ''} | ${money(row.unit_cost)} | ${money(row.amount)} |`);
    parts.push('', '### 工程', '', '| 名称 | 工数 | 時間単価 | 金額 |', '|---|---:|---:|---:|');
    for (const row of ledger.labor_lines ?? []) parts.push(`| ${cell(row.process_name)} | ${row.work_hours ?? ''} | ${money(row.labor_rate)} | ${money(row.amount)} |`);
    const ledgerCost = [...(ledger.cost_lines ?? []), ...(ledger.labor_lines ?? [])].reduce((sum, row) => sum + Number(row.amount || 0), 0);
    parts.push('', `- 原価合計: ${money(ledgerCost)}`);
  }
  return parts.join('\n');
}
