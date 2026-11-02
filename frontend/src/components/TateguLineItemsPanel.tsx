import { useEffect, useState } from 'react';
import type React from 'react';
import type { AggregationCategoryMaster } from '../api/aggregationCategories';
import type { CostLine, LaborLine } from '../types/tateguItem';

export type CostLineDraft = Omit<CostLine, 'id' | 'tategu_item_id'>;
export type LaborLineDraft = Omit<LaborLine, 'id' | 'tategu_item_id'>;

interface CostLinesProps {
  lines: CostLineDraft[];
  onChange: (lines: CostLineDraft[]) => void;
  categories: AggregationCategoryMaster[];
}
interface LaborLinesProps {
  lines: LaborLineDraft[];
  onChange: (lines: LaborLineDraft[]) => void;
  categories: AggregationCategoryMaster[];
}

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
  const active = categories
    .filter((category) => category.measure_type === measureType && category.is_active !== 0 && allowed.includes(category.code))
    .sort((a, b) => a.sort_order - b.sort_order);
  return active.length ? active : measureType === 'money' ? fallbackMoneyCategories : fallbackTimeCategories;
}

const costAmount = (line: Pick<CostLineDraft, 'quantity' | 'unit_cost'>) =>
  (Number(line.quantity) || 0) * (Number(line.unit_cost) || 0);
const laborAmount = (line: Pick<LaborLineDraft, 'work_hours' | 'labor_rate'>) =>
  (Number(line.work_hours) || 0) * (Number(line.labor_rate) || 0);
const moneyText = (value: number) => `¥${Math.round(value).toLocaleString('ja-JP')}`;
const hoursText = (value: number) => Number(value).toLocaleString('ja-JP', { maximumFractionDigits: 2 });
const numberText = (value: number) => Number(value).toLocaleString('ja-JP', { maximumFractionDigits: 10 });

function orderByCategory<T extends { category_code: string }>(
  lines: T[],
  options: Array<{ code: string }>,
) {
  const categoryOrder = new Map(options.map((option, index) => [option.code, index]));
  return lines
    .map((line, index) => ({ line, index }))
    .sort((a, b) =>
      (categoryOrder.get(a.line.category_code) ?? options.length) -
        (categoryOrder.get(b.line.category_code) ?? options.length) ||
      a.index - b.index)
    .map(({ line }) => line);
}

const withCostOrders = (lines: CostLineDraft[], options: Array<{ code: string }>) =>
  orderByCategory(lines, options).map((line, index) => ({ ...line, amount: costAmount(line), sort_order: index }));
const withLaborOrders = (lines: LaborLineDraft[], options: Array<{ code: string }>) =>
  orderByCategory(lines, options).map((line, index) => ({ ...line, amount: laborAmount(line), sort_order: index }));

function NumericCell({
  label,
  value,
  money = false,
  integer = false,
  disabled = false,
  placeholder,
  onChange,
}: {
  label: string;
  value: number;
  money?: boolean;
  integer?: boolean;
  disabled?: boolean;
  placeholder?: string;
  onChange: (value: number) => void;
}) {
  const format = (number: number) => (money ? moneyText(number) : numberText(number));
  const [raw, setRaw] = useState('');
  const [focused, setFocused] = useState(false);
  return (
    <input
      aria-label={label}
      inputMode={integer ? 'numeric' : 'decimal'}
      value={focused ? raw : format(value)}
      disabled={disabled}
      className="bv-control bv-number"
      style={{ textAlign: 'right' }}
      step={integer ? 1 : undefined}
      placeholder={placeholder}
      onFocus={() => {
        setRaw(String(value || ''));
        setFocused(true);
      }}
      onChange={(event) => {
        const cleaned = integer
          ? event.target.value.replace(/\D/g, '')
          : event.target.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');
        setRaw(cleaned);
        onChange(Number(cleaned) || 0);
      }}
      onBlur={() => setFocused(false)}
    />
  );
}

function CategorySelect({
  label,
  value,
  options,
  disabled,
  onCommit,
}: {
  label: string;
  value: string;
  options: Array<{ code: string; name: string }>;
  disabled?: boolean;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <select
      aria-label={label}
      value={draft}
      disabled={disabled}
      className="bv-control"
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (draft !== value) onCommit(draft);
      }}
    >
      {options.map((option) => <option key={option.code} value={option.code}>{option.name}</option>)}
    </select>
  );
}

const leavesRow = (event: React.FocusEvent<HTMLTableRowElement>) => !event.currentTarget.contains(event.relatedTarget);

function CostBlankRow({ categoryName, onCommit }: { categoryName: string; onCommit: (patch: Partial<CostLineDraft>) => void }) {
  const empty = { name: '', quantity: 1, unit_cost: 0 };
  const [draft, setDraft] = useState(empty);
  const commit = (event: React.FocusEvent<HTMLTableRowElement>) => {
    if (!leavesRow(event)) return;
    if (draft.name || draft.quantity !== 1 || draft.unit_cost !== 0) onCommit(draft);
    setDraft(empty);
  };
  return (
    <tr className="bv-placeholder-row" onBlur={commit}>
      <td><span className="bv-control">{categoryName}</span></td>
      <td className="bv-edit-cell bv-fill-cell"><input aria-label="材料名" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className="bv-control" placeholder="空行に入力すると追加" /></td>
      <td className="bv-edit-cell bv-fill-cell"><NumericCell label="数量" value={draft.quantity} placeholder="数量" onChange={(quantity) => setDraft((d) => ({ ...d, quantity }))} /></td>
      <td className="bv-edit-cell bv-fill-cell"><NumericCell label="材料単価" value={draft.unit_cost} money integer placeholder="単価" onChange={(unit_cost) => setDraft((d) => ({ ...d, unit_cost }))} /></td>
      <td className="bv-amount">{moneyText(costAmount(draft))}</td><td />
    </tr>
  );
}

function LaborBlankRow({ categoryName, onCommit }: { categoryName: string; onCommit: (patch: Partial<LaborLineDraft>) => void }) {
  const empty = { process_name: '', work_hours: 1, labor_rate: 0 };
  const [draft, setDraft] = useState(empty);
  const commit = (event: React.FocusEvent<HTMLTableRowElement>) => {
    if (!leavesRow(event)) return;
    if (draft.process_name || draft.work_hours !== 1 || draft.labor_rate !== 0) onCommit(draft);
    setDraft(empty);
  };
  return (
    <tr className="bv-placeholder-row" onBlur={commit}>
      <td className="bv-edit-cell bv-fill-cell"><input aria-label="工程名" value={draft.process_name} onChange={(event) => setDraft({ ...draft, process_name: event.target.value })} className="bv-control" placeholder="空行に入力すると追加" /></td>
      <td><span className="bv-control">{categoryName}</span></td>
      <td className="bv-edit-cell bv-fill-cell"><NumericCell label="工数" value={draft.work_hours} placeholder="工数" onChange={(work_hours) => setDraft((d) => ({ ...d, work_hours }))} /></td>
      <td className="bv-edit-cell bv-fill-cell"><NumericCell label="労務単価" value={draft.labor_rate} money integer placeholder="単価" onChange={(labor_rate) => setDraft((d) => ({ ...d, labor_rate }))} /></td>
      <td className="bv-amount">{moneyText(laborAmount({ work_hours: draft.work_hours, labor_rate: draft.labor_rate }))}</td><td />
    </tr>
  );
}

export function TateguCostLinesPanel({ lines, onChange, categories }: CostLinesProps) {
  const options = categoryOptions(categories, 'money');
  const orderedLines = orderByCategory(lines, options);
  const updateExisting = (line: CostLineDraft, patch: Partial<CostLineDraft>) => {
    const originalIndex = lines.indexOf(line);
    const updated = lines.map((item, index) => index === originalIndex ? { ...item, ...patch } : item);
    onChange(withCostOrders(updated, options));
  };
  const addBlank = (categoryCode: string, patch: Partial<CostLineDraft>) => {
    const blank: CostLineDraft = {
      category_code: categoryCode,
      name: '',
      quantity: 1,
      unit_cost: 0,
      amount: 0,
      source: 'manual',
      sort_order: lines.length,
      ...patch,
    };
    onChange(withCostOrders([...lines, blank], options));
  };
  const remove = (line: CostLineDraft) => onChange(withCostOrders(lines.filter((item) => item !== line), options));
  const total = lines.reduce((sum, line) => sum + costAmount(line), 0);

  return (
    <div className="bv-ui">
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${options.length + 1}, minmax(0, 1fr))` }}>
        {options.map((option) => (
          <div key={option.code} className="bv-cell bv-readonly">
            <span className="bv-label">{option.name}合計</span>
            <span className="bv-value bv-amount">
              {moneyText(lines.filter((line) => line.category_code === option.code).reduce((sum, line) => sum + costAmount(line), 0))}
            </span>
          </div>
        ))}
        <div className="bv-cell bv-readonly">
          <span className="bv-label">材料費合計</span>
          <strong className="bv-value bv-amount">{moneyText(total)}</strong>
        </div>
      </div>
      <table className="bv-table" aria-label="材料費明細">
        <thead><tr><th style={{ width: 112 }}>区分</th><th>名称</th><th className="bv-number" style={{ width: 96 }}>数量</th><th className="bv-number" style={{ width: 112 }}>単価</th><th className="bv-number" style={{ width: 112 }}>金額</th><th style={{ width: 48 }} /></tr></thead>
        <tbody>
          {options.flatMap((option) => {
            const categoryLines = orderedLines.filter((line) => line.category_code === option.code);
            return [
              ...categoryLines.map((line) => {
                const locked = line.source === 'wood_calc';
                return (
                  <tr key={`line-${lines.indexOf(line)}`}>
                    <td className={locked ? "bv-fill-cell bv-readonly" : "bv-edit-cell bv-fill-cell"}><CategorySelect label="材料区分" value={line.category_code} options={options} disabled={locked} onCommit={(category_code) => updateExisting(line, { category_code })} /></td>
                    <td className={locked ? "bv-fill-cell bv-readonly" : "bv-edit-cell bv-fill-cell"}><input aria-label="材料名" value={line.name} disabled={locked} onChange={(event) => updateExisting(line, { name: event.target.value })} className="bv-control" placeholder="材料名" /></td>
                    <td className={locked ? "bv-fill-cell bv-readonly" : "bv-edit-cell bv-fill-cell"}><NumericCell label="数量" value={line.quantity} disabled={locked} onChange={(quantity) => updateExisting(line, { quantity })} /></td>
                    <td className={locked ? "bv-fill-cell bv-readonly" : "bv-edit-cell bv-fill-cell"}><NumericCell label="材料単価" value={line.unit_cost} money integer disabled={locked} onChange={(unit_cost) => updateExisting(line, { unit_cost })} /></td>
                    <td className="bv-amount"><strong>{moneyText(costAmount(line))}</strong></td>
                    <td>{!locked && <button type="button" onClick={() => remove(line)} className="bv-link bv-link-danger">削除</button>}</td>
                  </tr>
                );
              }),
              <CostBlankRow key={`blank-${option.code}`} categoryName={option.name} onCommit={(patch) => addBlank(option.code, patch)} />,
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}

export function TateguLaborLinesPanel({ lines, onChange, categories }: LaborLinesProps) {
  const options = categoryOptions(categories, 'time');
  const orderedLines = orderByCategory(lines, options);
  const updateExisting = (line: LaborLineDraft, patch: Partial<LaborLineDraft>) => {
    const originalIndex = lines.indexOf(line);
    const updated = lines.map((item, index) => index === originalIndex ? { ...item, ...patch } : item);
    onChange(withLaborOrders(updated, options));
  };
  const addBlank = (categoryCode: string, patch: Partial<LaborLineDraft>) => {
    const blank: LaborLineDraft = {
      process_name: '', category_code: categoryCode, work_hours: 1, labor_rate: 0,
      amount: 0, sort_order: lines.length, ...patch,
    };
    onChange(withLaborOrders([...lines, blank], options));
  };
  const remove = (line: LaborLineDraft) => onChange(withLaborOrders(lines.filter((item) => item !== line), options));
  const totalHours = lines.reduce((sum, line) => sum + (Number(line.work_hours) || 0), 0);
  const total = lines.reduce((sum, line) => sum + laborAmount(line), 0);

  return (
    <div className="bv-ui">
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${options.length + 1}, minmax(0, 1fr))` }}>
        {options.map((option) => {
          const categoryLines = lines.filter((line) => line.category_code === option.code);
          return <div key={option.code} className="bv-cell bv-readonly"><span className="bv-label">{option.name}合計</span><span className="bv-value bv-number">{hoursText(categoryLines.reduce((sum, line) => sum + line.work_hours, 0))} h / {moneyText(categoryLines.reduce((sum, line) => sum + laborAmount(line), 0))}</span></div>;
        })}
        <div className="bv-cell bv-readonly"><span className="bv-label">労務費合計</span><strong className="bv-value bv-amount">{moneyText(total)} / {hoursText(totalHours)} h</strong></div>
      </div>
      <table className="bv-table" aria-label="労務費明細">
        <thead><tr><th>工程名</th><th style={{ width: 112 }}>区分</th><th className="bv-number" style={{ width: 96 }}>工数</th><th className="bv-number" style={{ width: 112 }}>労務単価</th><th className="bv-number" style={{ width: 112 }}>金額</th><th style={{ width: 48 }} /></tr></thead>
        <tbody>
          {options.flatMap((option) => {
            const categoryLines = orderedLines.filter((line) => line.category_code === option.code);
            return [
              ...categoryLines.map((line) => (
                <tr key={`line-${lines.indexOf(line)}`}>
                  <td className="bv-edit-cell bv-fill-cell"><input aria-label="工程名" value={line.process_name} onChange={(event) => updateExisting(line, { process_name: event.target.value })} className="bv-control" placeholder="工程名" /></td>
                  <td className="bv-edit-cell bv-fill-cell"><CategorySelect label="労務区分" value={line.category_code} options={options} onCommit={(category_code) => updateExisting(line, { category_code })} /></td>
                  <td className="bv-edit-cell bv-fill-cell"><NumericCell label="工数" value={line.work_hours} onChange={(work_hours) => updateExisting(line, { work_hours })} /></td>
                  <td className="bv-edit-cell bv-fill-cell"><NumericCell label="労務単価" value={line.labor_rate} money integer onChange={(labor_rate) => updateExisting(line, { labor_rate })} /></td>
                  <td className="bv-amount"><strong>{moneyText(laborAmount(line))}</strong></td>
                  <td><button type="button" onClick={() => remove(line)} className="bv-link bv-link-danger">削除</button></td>
                </tr>
              )),
              <LaborBlankRow key={`blank-${option.code}`} categoryName={option.name} onCommit={(patch) => addBlank(option.code, patch)} />,
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}
