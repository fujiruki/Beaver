import { formatDecimal, round2 } from '../lib/decimal';
import { useEffect, useState } from 'react';
import type React from 'react';
import type { AggregationCategoryMaster } from '../api/aggregationCategories';
import type { CostLine, LaborLine } from '../types/tateguItem';

export type CostLineDraft = Omit<CostLine, 'id' | 'tategu_item_id'> & { id?: number };
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
const hoursText = formatDecimal;
const numberText = formatDecimal;

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

function NumericCell({
  label,
  value,
  money = false,
  integer = false,
  emptyWhenZero = false,
  disabled = false,
  placeholder,
  onChange,
}: {
  label: string;
  value: number;
  money?: boolean;
  integer?: boolean;
  emptyWhenZero?: boolean;
  disabled?: boolean;
  placeholder?: string;
  onChange: (value: number) => void;
}) {
  const format = (number: number) => emptyWhenZero && number === 0 ? '' : (money ? moneyText(number) : numberText(number));
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
        setRaw(String((integer ? value : round2(value)) || ''));
        setFocused(true);
      }}
      onChange={(event) => {
        const cleaned = integer
          ? event.target.value.replace(/\D/g, '')
          : event.target.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');
        setRaw(cleaned);
        onChange(integer ? Number(cleaned) || 0 : round2(Number(cleaned) || 0));
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

const focusAndReveal = (target: HTMLElement | null | undefined) => {
  if (!target) return;
  target.focus();
  requestAnimationFrame(() => {
    (document.activeElement as HTMLElement | null)?.closest('tr')?.scrollIntoView?.({ block: 'nearest' });
  });
};

const isImeEnter = (event: React.KeyboardEvent) => event.nativeEvent.isComposing || event.keyCode === 229;

const leavesRow =(event: React.FocusEvent<HTMLTableRowElement>) => !event.currentTarget.contains(event.relatedTarget);

function CostBlankRow({ categoryName, onCommit }: { categoryName: string; onCommit: (patch: Partial<CostLineDraft>) => void }) {
  const empty = { name: '', quantity: 1, unit_cost: 0 };
  const [draft, setDraft] = useState(empty);
  const commit = (event: React.FocusEvent<HTMLTableRowElement>) => {
    if (!leavesRow(event)) return;
    if (draft.name || draft.quantity !== 1 || draft.unit_cost !== 0) onCommit(draft);
    setDraft(empty);
  };
  const handleKeyDown = (event: React.KeyboardEvent<HTMLTableRowElement>) => {
    if (event.key === 'Enter' && !isImeEnter(event)) {
      event.preventDefault();
      if (draft.name || draft.quantity !== 1 || draft.unit_cost !== 0) {
        onCommit(draft);
        setDraft(empty);
        const row = event.currentTarget;
        focusAndReveal(row.closest('tbody')?.querySelector<HTMLInputElement>(`tr[data-blank-row="true"][data-category="${row.dataset.category}"] [aria-label="材料名"]`));
      }
      return;
    }
    if (event.key !== 'Tab' || event.nativeEvent.isComposing) return;
    const target = event.target as HTMLInputElement;
    const row = event.currentTarget;
    const blankRows = Array.from(row.closest('tbody')?.querySelectorAll<HTMLTableRowElement>('tr[data-blank-row="true"]') ?? []);
    const rowIndex = blankRows.indexOf(row);
    if (target.getAttribute('aria-label') === '材料名') {
      const destination = blankRows[rowIndex + (event.shiftKey ? -1 : 1)]?.querySelector<HTMLInputElement>('[aria-label="材料名"]');
      if (destination && (event.shiftKey || (!draft.name && draft.quantity === 1 && draft.unit_cost === 0))) {
        event.preventDefault();
        focusAndReveal(destination);
      }
      return;
    }
    if (!event.shiftKey && target.getAttribute('aria-label') === '材料単価') {
      event.preventDefault();
      const tbody = row.closest('tbody');
      const category = row.dataset.category;
      if (draft.name || draft.quantity !== 1 || draft.unit_cost !== 0) onCommit(draft);
      setDraft(empty);
      focusAndReveal(tbody?.querySelector<HTMLInputElement>(`tr[data-blank-row="true"][data-category="${category}"] [aria-label="材料名"]`));
    }
  };
  return (
    <tr className="bv-placeholder-row" data-blank-row="true" data-category={categoryName} onBlur={commit} onKeyDown={handleKeyDown}>
      <td><span className="bv-control">{categoryName}</span></td>
      <td className="bv-edit-cell bv-fill-cell"><input aria-label="材料名" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className="bv-control" placeholder="空行に入力すると追加" /></td>
      <td className="bv-edit-cell bv-fill-cell"><NumericCell label="数量" value={draft.quantity} placeholder="数量" onChange={(quantity) => setDraft((d) => ({ ...d, quantity }))} /></td>
      <td className="bv-edit-cell bv-fill-cell"><NumericCell label="材料単価" value={draft.unit_cost} money integer placeholder="単価" onChange={(unit_cost) => setDraft((d) => ({ ...d, unit_cost }))} /></td>
      <td className="bv-amount">{moneyText(costAmount(draft))}</td><td />
    </tr>
  );
}

interface LaborRow {
  process_name: string;
  labor_rate: number;
  factory: number;
  site: number;
}

const emptyLaborRow: LaborRow = { process_name: '', labor_rate: 0, factory: 0, site: 0 };
const laborRowAmount = (row: LaborRow) => (Number(row.labor_rate) || 0) * ((Number(row.factory) || 0) + (Number(row.site) || 0));
const isEmptyLaborRow = (row: LaborRow) => !row.process_name && !row.factory && !row.site && !row.labor_rate;

function toLaborRows(lines: LaborLineDraft[]) {
  const sorted = lines
    .map((line, index) => ({ line, index }))
    .sort((a, b) => (Number(a.line.sort_order) || 0) - (Number(b.line.sort_order) || 0) || a.index - b.index)
    .map(({ line }) => line);
  const extras = sorted.filter((line) => !timeCodes.includes(line.category_code));
  const timed = sorted.filter((line) => timeCodes.includes(line.category_code));
  const rows: LaborRow[] = [];
  for (let i = 0; i < timed.length; i++) {
    const line = timed[i];
    const next = timed[i + 1];
    const row: LaborRow = {
      process_name: line.process_name,
      labor_rate: line.labor_rate,
      factory: line.category_code === 'FACTORY_TIME' ? line.work_hours : 0,
      site: line.category_code === 'SITE_TIME' ? line.work_hours : 0,
    };
    if (line.category_code === 'FACTORY_TIME' && next?.category_code === 'SITE_TIME'
      && next.process_name === line.process_name && next.labor_rate === line.labor_rate) {
      row.site = next.work_hours;
      i++;
    }
    rows.push(row);
  }
  return { rows, extras };
}

function toLaborLines(rows: LaborRow[], extras: LaborLineDraft[]): LaborLineDraft[] {
  const lines: LaborLineDraft[] = [];
  const make = (row: LaborRow, category_code: string, work_hours: number, sort_order: number): LaborLineDraft => ({
    process_name: row.process_name, category_code, work_hours, labor_rate: row.labor_rate,
    amount: work_hours * (Number(row.labor_rate) || 0), sort_order,
  });
  rows.forEach((row, index) => {
    const k = index + 1;
    if (row.factory) lines.push(make(row, 'FACTORY_TIME', row.factory, 2 * k - 1));
    if (row.site) lines.push(make(row, 'SITE_TIME', row.site, 2 * k));
    if (!row.factory && !row.site && row.process_name) lines.push(make(row, 'FACTORY_TIME', 0, 2 * k - 1));
  });
  extras.forEach((line, index) => lines.push({ ...line, amount: laborAmount(line), sort_order: 2 * rows.length + 1 + index }));
  return lines;
}

function LaborBlankRow({ onCommit }: { onCommit: (row: LaborRow) => void }) {
  const [draft, setDraft] = useState<LaborRow>(emptyLaborRow);
  const commit = () => {
    if (!isEmptyLaborRow(draft)) onCommit(draft);
    setDraft(emptyLaborRow);
  };
  const handleKeyDown = (event: React.KeyboardEvent<HTMLTableRowElement>) => {
    if (event.key === 'Enter' && !isImeEnter(event)) {
      event.preventDefault();
      if (!isEmptyLaborRow(draft)) {
        commit();
        focusAndReveal(event.currentTarget.querySelector<HTMLInputElement>('[aria-label="工程名"]'));
      }
      return;
    }
    if (event.key !== 'Tab' || event.shiftKey || event.nativeEvent.isComposing) return;
    const target = event.target as HTMLInputElement;
    if (target.getAttribute('aria-label') !== '労務単価') return;
    event.preventDefault();
    const row = event.currentTarget;
    commit();
    focusAndReveal(row.querySelector<HTMLInputElement>('[aria-label="工程名"]'));
  };
  return (
    <tr className="bv-placeholder-row" data-blank-row="true" onBlur={(event) => leavesRow(event) && commit()} onKeyDown={handleKeyDown}>
      <td className="bv-edit-cell bv-fill-cell"><input aria-label="工程名" value={draft.process_name} onChange={(event) => setDraft({ ...draft, process_name: event.target.value })} className="bv-control" placeholder="空行に入力すると追加" /></td>
      <td className="bv-edit-cell bv-fill-cell"><NumericCell label="工場時間" value={draft.factory} emptyWhenZero placeholder="工場" onChange={(factory) => setDraft((d) => ({ ...d, factory }))} /></td>
      <td className="bv-edit-cell bv-fill-cell"><NumericCell label="現場時間" value={draft.site} emptyWhenZero placeholder="現場" onChange={(site) => setDraft((d) => ({ ...d, site }))} /></td>
      <td className="bv-edit-cell bv-fill-cell"><NumericCell label="労務単価" value={draft.labor_rate} money integer placeholder="単価" onChange={(labor_rate) => setDraft((d) => ({ ...d, labor_rate }))} /></td>
      <td className="bv-amount">{moneyText(laborRowAmount(draft))}</td><td />
    </tr>
  );
}

function MoveButtons({ canUp, canDown, onMove }: { canUp: boolean; canDown: boolean; onMove: (direction: -1 | 1) => void }) {
  return (
    <>
      <button type="button" aria-label="上へ" disabled={!canUp} onClick={() => onMove(-1)} className="bv-link">▲</button>
      <button type="button" aria-label="下へ" disabled={!canDown} onClick={() => onMove(1)} className="bv-link">▼</button>
    </>
  );
}

function swapped<T>(items: T[], index: number, direction: -1 | 1) {
  const copy = [...items];
  [copy[index], copy[index + direction]] = [copy[index + direction], copy[index]];
  return copy;
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
  const move = (line: CostLineDraft, direction: -1 | 1) =>
    onChange(withCostOrders(swapped(orderedLines, orderedLines.indexOf(line), direction), options));
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
        <thead><tr><th style={{ width: 112 }}>区分</th><th>名称</th><th className="bv-number" style={{ width: 96 }}>数量</th><th className="bv-number" style={{ width: 112 }}>単価</th><th className="bv-number" style={{ width: 112 }}>金額</th><th style={{ width: 112 }} /></tr></thead>
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
                    <td style={{ whiteSpace: 'nowrap' }}>{!locked && (
                      <>
                        <MoveButtons canUp={categoryLines.indexOf(line) > 0} canDown={categoryLines.indexOf(line) < categoryLines.length - 1} onMove={(direction) => move(line, direction)} />
                        <button type="button" onClick={() => remove(line)} className="bv-link bv-link-danger">削除</button>
                      </>
                    )}</td>
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
  const { rows, extras } = toLaborRows(lines);
  const emit = (nextRows: LaborRow[]) => onChange(toLaborLines(nextRows, extras));
  const update = (index: number, patch: Partial<LaborRow>) => emit(rows.map((row, i) => i === index ? { ...row, ...patch } : row));
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
        <thead><tr><th>工程名</th><th className="bv-number" style={{ width: 96 }}>工場時間</th><th className="bv-number" style={{ width: 96 }}>現場時間</th><th className="bv-number" style={{ width: 112 }}>労務単価</th><th className="bv-number" style={{ width: 112 }}>金額</th><th style={{ width: 112 }} /></tr></thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`row-${index}`}>
              <td className="bv-edit-cell bv-fill-cell"><input aria-label="工程名" value={row.process_name} onChange={(event) => update(index, { process_name: event.target.value })} className="bv-control" placeholder="工程名" /></td>
              <td className="bv-edit-cell bv-fill-cell"><NumericCell label="工場時間" value={row.factory} emptyWhenZero onChange={(factory) => update(index, { factory })} /></td>
              <td className="bv-edit-cell bv-fill-cell"><NumericCell label="現場時間" value={row.site} emptyWhenZero onChange={(site) => update(index, { site })} /></td>
              <td className="bv-edit-cell bv-fill-cell"><NumericCell label="労務単価" value={row.labor_rate} money integer onChange={(labor_rate) => update(index, { labor_rate })} /></td>
              <td className="bv-amount"><strong>{moneyText(laborRowAmount(row))}</strong></td>
              <td style={{ whiteSpace: 'nowrap' }}>
                <MoveButtons canUp={index > 0} canDown={index < rows.length - 1} onMove={(direction) => emit(swapped(rows, index, direction))} />
                <button type="button" onClick={() => emit(rows.filter((_, i) => i !== index))} className="bv-link bv-link-danger">削除</button>
              </td>
            </tr>
          ))}
          <LaborBlankRow onCommit={(row) => emit([...rows, row])} />
        </tbody>
      </table>
    </div>
  );
}
