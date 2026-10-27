import { useState } from 'react';
import type { AggregationCategoryMaster } from '../api/aggregationCategories';
import type { CostLine, LaborLine } from '../types/tateguItem';

export type CostLineDraft = Omit<CostLine, 'id' | 'tategu_item_id'>;
export type LaborLineDraft = Omit<LaborLine, 'id' | 'tategu_item_id'>;

interface CostLinesProps { lines: CostLineDraft[]; onChange: (lines: CostLineDraft[]) => void; categories: AggregationCategoryMaster[] }
interface LaborLinesProps { lines: LaborLineDraft[]; onChange: (lines: LaborLineDraft[]) => void; categories: AggregationCategoryMaster[] }

const inputCls = 'w-full px-2.5 py-1.5 border border-slate-300 rounded-md text-sm focus:outline-none focus:border-blue-400';
const numericCls = `${inputCls} text-right tabular-nums`;
const moneyCodes = ['body', 'hardware', 'glass', 'MAIN', 'HARDWARE', 'GLASS'];
const timeCodes = ['FACTORY_TIME', 'SITE_TIME'];
const fallbackMoneyCategories = [
  { code: 'MAIN', name: '本体', measure_type: 'money', sort_order: 1 },
  { code: 'HARDWARE', name: '金物', measure_type: 'money', sort_order: 2 },
  { code: 'GLASS', name: 'ガラス', measure_type: 'money', sort_order: 3 },
];
const fallbackTimeCategories = [
  { code: 'FACTORY_TIME', name: '工場時間', measure_type: 'time', sort_order: 4 },
  { code: 'SITE_TIME', name: '現場時間', measure_type: 'time', sort_order: 5 },
];

function categoryOptions(categories: AggregationCategoryMaster[], measureType: 'money' | 'time') {
  const allowed = measureType === 'money' ? moneyCodes : timeCodes;
  const active = categories.filter(c => c.measure_type === measureType && c.is_active !== 0 && allowed.includes(c.code)).sort((a, b) => a.sort_order - b.sort_order);
  return active.length ? active : measureType === 'money' ? fallbackMoneyCategories : fallbackTimeCategories;
}
const costAmount = (line: Pick<CostLineDraft, 'quantity' | 'unit_cost'>) => (Number(line.quantity) || 0) * (Number(line.unit_cost) || 0);
const laborAmount = (line: Pick<LaborLineDraft, 'work_hours' | 'labor_rate'>) => (Number(line.work_hours) || 0) * (Number(line.labor_rate) || 0);
const moneyText = (value: number) => `¥${Math.round(value).toLocaleString('ja-JP')}`;
const numberText = (value: number) => Number(value).toLocaleString('ja-JP', { maximumFractionDigits: 10 });
const withCostOrders = (lines: CostLineDraft[]) => lines.map((line, index) => ({ ...line, amount: costAmount(line), sort_order: index }));
const withLaborOrders = (lines: LaborLineDraft[]) => lines.map((line, index) => ({ ...line, amount: laborAmount(line), sort_order: index }));

function NumericCell({ label, value, money = false, integer = false, disabled = false, onChange }: {
  label: string; value: number; money?: boolean; integer?: boolean; disabled?: boolean; onChange: (value: number) => void;
}) {
  const format = (n: number) => money ? moneyText(n) : numberText(n);
  const [raw, setRaw] = useState('');
  const [focused, setFocused] = useState(false);
  return <input aria-label={label} inputMode={integer ? 'numeric' : 'decimal'} value={focused ? raw : format(value)} disabled={disabled}
    className={numericCls} style={{ textAlign: 'right' }}
    step={integer ? 1 : undefined}
    onFocus={() => { setRaw(String(value || '')); setFocused(true); }}
    onChange={e => {
      const cleaned = integer ? e.target.value.replace(/\D/g, '') : e.target.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');
      setRaw(cleaned);
      onChange(Number(cleaned) || 0);
    }}
    onBlur={() => { setFocused(false); }} />;
}

export function TateguCostLinesPanel({ lines, onChange, categories }: CostLinesProps) {
  const options = categoryOptions(categories, 'money');
  const blank: CostLineDraft = { category_code: options[0]?.code ?? 'MAIN', name: '', quantity: 1, unit_cost: 0, amount: 0, source: 'manual', sort_order: lines.length };
  const rendered = [...lines, blank];
  const update = (index: number, patch: Partial<CostLineDraft>) => {
    const base = index === lines.length ? [...lines, blank] : lines;
    onChange(withCostOrders(base.map((line, i) => i === index ? { ...line, ...patch } : line)));
  };
  const remove = (index: number) => onChange(withCostOrders(lines.filter((_, i) => i !== index)));
  const total = lines.reduce((sum, line) => sum + costAmount(line), 0);
  return <div>
    {lines.length > 0 && <div className="flex flex-wrap gap-3 mb-5">
      {options.map(option => <div key={option.code} className="flex-1 min-w-28 bg-slate-50 border border-slate-200 rounded-lg px-4 py-3"><div className="text-xs text-slate-400 mb-1">{option.name}合計</div><div className="font-bold text-sm">{moneyText(lines.filter(l => l.category_code === option.code).reduce((s, l) => s + costAmount(l), 0))}</div></div>)}
      <div className="flex-1 min-w-36 bg-slate-800 text-white rounded-lg px-4 py-3"><div className="text-xs text-slate-300 mb-1">材料費合計</div><div className="font-bold text-lg">{moneyText(total)}</div></div>
    </div>}
    <table className="w-full text-sm"><thead><tr className="text-xs text-slate-400 border-b"><th className="text-left pb-1 w-28">区分</th><th className="text-left pb-1">名称</th><th className="text-right pb-1 w-24">数量</th><th className="text-right pb-1 w-28">単価</th><th className="text-right pb-1 w-28">金額</th><th className="w-12" /></tr></thead>
      <tbody>{rendered.map((line, index) => { const blankRow = index === lines.length; const locked = line.source === 'wood_calc'; return <tr key={blankRow ? 'blank' : index} className="border-b border-slate-100">
        <td className="py-1 pr-2"><select aria-label="材料区分" value={line.category_code} disabled={locked} onChange={e => update(index, { category_code: e.target.value })} className={inputCls}>{options.map(o => <option key={o.code} value={o.code}>{o.name}</option>)}</select></td>
        <td className="py-1 pr-2"><input aria-label="材料名" value={line.name} disabled={locked} onChange={e => update(index, { name: e.target.value })} className={inputCls} placeholder={blankRow ? '空行に入力すると追加' : '材料名'} /></td>
        <td className="py-1 pr-2"><NumericCell label="数量" value={line.quantity} disabled={locked} onChange={v => update(index, { quantity: v })} /></td>
        <td className="py-1 pr-2"><NumericCell label="材料単価" value={line.unit_cost} money integer disabled={locked} onChange={v => update(index, { unit_cost: v })} /></td>
        <td className="py-1 pr-2 text-right font-semibold">{moneyText(costAmount(line))}</td><td>{!blankRow && !locked && <button type="button" onClick={() => remove(index)} className="text-xs text-red-500">削除</button>}</td>
      </tr>; })}</tbody></table>
  </div>;
}

export function TateguLaborLinesPanel({ lines, onChange, categories }: LaborLinesProps) {
  const options = categoryOptions(categories, 'time');
  const blank: LaborLineDraft = { process_name: '', category_code: options[0]?.code ?? 'FACTORY_TIME', work_hours: 1, labor_rate: 0, amount: 0, sort_order: lines.length };
  const rendered = [...lines, blank];
  const update = (index: number, patch: Partial<LaborLineDraft>) => { const base = index === lines.length ? [...lines, blank] : lines; onChange(withLaborOrders(base.map((line, i) => i === index ? { ...line, ...patch } : line))); };
  const remove = (index: number) => onChange(withLaborOrders(lines.filter((_, i) => i !== index)));
  const totalHours = lines.reduce((s, l) => s + (Number(l.work_hours) || 0), 0);
  const total = lines.reduce((s, l) => s + laborAmount(l), 0);
  return <div>
    {lines.length > 0 && <div className="flex flex-wrap gap-3 mb-5">{options.map(o => <div key={o.code} className="flex-1 min-w-28 bg-slate-50 border rounded-lg px-4 py-3"><div className="text-xs text-slate-400">{o.name}合計</div><div className="font-bold">{numberText(lines.filter(l => l.category_code === o.code).reduce((s, l) => s + l.work_hours, 0))} h</div><div className="text-xs text-slate-400">{moneyText(lines.filter(l => l.category_code === o.code).reduce((s, l) => s + laborAmount(l), 0))}</div></div>)}<div className="flex-1 min-w-36 bg-slate-800 text-white rounded-lg px-4 py-3"><div className="text-xs">労務費合計</div><div className="font-bold text-lg">{moneyText(total)}</div><div className="text-xs">{numberText(totalHours)} h</div></div></div>}
    <table className="w-full text-sm"><thead><tr className="text-xs text-slate-400 border-b"><th className="text-left pb-1">工程名</th><th className="text-left pb-1 w-28">区分</th><th className="text-right pb-1 w-24">工数</th><th className="text-right pb-1 w-28">労務単価</th><th className="text-right pb-1 w-28">金額</th><th className="w-12" /></tr></thead>
      <tbody>{rendered.map((line, index) => { const blankRow = index === lines.length; return <tr key={blankRow ? 'blank' : index} className="border-b border-slate-100"><td className="py-1 pr-2"><input aria-label="工程名" value={line.process_name} onChange={e => update(index, { process_name: e.target.value })} className={inputCls} placeholder={blankRow ? '空行に入力すると追加' : '工程名'} /></td><td className="py-1 pr-2"><select aria-label="労務区分" value={line.category_code} onChange={e => update(index, { category_code: e.target.value })} className={inputCls}>{options.map(o => <option key={o.code} value={o.code}>{o.name}</option>)}</select></td><td className="py-1 pr-2"><NumericCell label="工数" value={line.work_hours} onChange={v => update(index, { work_hours: v })} /></td><td className="py-1 pr-2"><NumericCell label="労務単価" value={line.labor_rate} money integer onChange={v => update(index, { labor_rate: v })} /></td><td className="py-1 pr-2 text-right font-semibold">{moneyText(laborAmount(line))}</td><td>{!blankRow && <button type="button" onClick={() => remove(index)} className="text-xs text-red-500">削除</button>}</td></tr>; })}</tbody></table>
  </div>;
}
