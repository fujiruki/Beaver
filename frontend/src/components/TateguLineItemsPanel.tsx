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

const inputCls = 'w-full px-2.5 py-1.5 border border-slate-300 rounded-md text-sm focus:outline-none focus:border-blue-400';
const moneyCodes = ['body', 'hardware', 'glass'];
const timeCodes = ['factory_hours', 'site_hours'];

const fallbackMoneyCategories: Pick<AggregationCategoryMaster, 'code' | 'name' | 'measure_type' | 'sort_order'>[] = [
  { code: 'body', name: '本体', measure_type: 'money', sort_order: 0 },
  { code: 'hardware', name: '金物', measure_type: 'money', sort_order: 1 },
  { code: 'glass', name: 'ガラス', measure_type: 'money', sort_order: 2 },
];

const fallbackTimeCategories: Pick<AggregationCategoryMaster, 'code' | 'name' | 'measure_type' | 'sort_order'>[] = [
  { code: 'factory_hours', name: '工場時間', measure_type: 'time', sort_order: 0 },
  { code: 'site_hours', name: '現場時間', measure_type: 'time', sort_order: 1 },
];

function categoryOptions(
  categories: AggregationCategoryMaster[],
  measureType: 'money' | 'time',
) {
  const allowedCodes = measureType === 'money' ? moneyCodes : timeCodes;
  const fallback = measureType === 'money' ? fallbackMoneyCategories : fallbackTimeCategories;
  const active = categories
    .filter(c => c.measure_type === measureType && c.is_active !== 0 && allowedCodes.includes(c.code))
    .sort((a, b) => a.sort_order - b.sort_order);
  return active.length > 0 ? active : fallback;
}

function costAmount(line: Pick<CostLineDraft, 'quantity' | 'unit_cost'>) {
  return (Number(line.quantity) || 0) * (Number(line.unit_cost) || 0);
}

function laborAmount(line: Pick<LaborLineDraft, 'work_hours' | 'labor_rate'>) {
  return (Number(line.work_hours) || 0) * (Number(line.labor_rate) || 0);
}

function withCostOrders(lines: CostLineDraft[]) {
  return lines.map((line, index) => ({
    ...line,
    amount: costAmount(line),
    sort_order: index,
  }));
}

function withLaborOrders(lines: LaborLineDraft[]) {
  return lines.map((line, index) => ({
    ...line,
    amount: laborAmount(line),
    sort_order: index,
  }));
}

function moneyText(value: number) {
  return `¥${Math.round(value).toLocaleString()}`;
}

export function TateguCostLinesPanel({ lines, onChange, categories }: CostLinesProps) {
  const options = categoryOptions(categories, 'money');
  const total = lines.reduce((sum, line) => sum + costAmount(line), 0);

  function updateLine(index: number, patch: Partial<CostLineDraft>) {
    const next = lines.map((line, i) => {
      if (i !== index) return line;
      const updated = { ...line, ...patch };
      return { ...updated, amount: costAmount(updated) };
    });
    onChange(withCostOrders(next));
  }

  function addLine() {
    const category = options[0];
    onChange(withCostOrders([...lines, {
      category_code: category?.code ?? 'body',
      name: '',
      quantity: 1,
      unit_cost: 0,
      amount: 0,
      source: 'manual',
      sort_order: lines.length,
    }]));
  }

  function removeLine(index: number) {
    onChange(withCostOrders(lines.filter((_, i) => i !== index)));
  }

  return (
    <div>
      {lines.length > 0 && (
        <div className="flex flex-wrap gap-3 mb-5">
          {options.map(option => {
            const optionTotal = lines
              .filter(line => line.category_code === option.code)
              .reduce((sum, line) => sum + costAmount(line), 0);
            return (
              <div key={option.code} className="flex-1 min-w-28 bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
                <div className="text-xs text-slate-400 mb-1">{option.name}合計</div>
                <div className="font-bold text-sm">{moneyText(optionTotal)}</div>
              </div>
            );
          })}
          <div className="flex-1 min-w-36 bg-slate-800 text-white rounded-lg px-4 py-3">
            <div className="text-xs text-slate-300 mb-1">材料費合計</div>
            <div className="font-bold text-lg">{moneyText(total)}</div>
          </div>
        </div>
      )}

      {lines.length === 0 ? (
        <p className="text-xs text-slate-400">材料明細行がありません。行追加で入力できます。</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-400 border-b border-slate-200">
              <th className="text-left pb-1 font-semibold w-28">区分</th>
              <th className="text-left pb-1 font-semibold">名称</th>
              <th className="text-left pb-1 font-semibold w-24">数量</th>
              <th className="text-left pb-1 font-semibold w-28">単価</th>
              <th className="text-right pb-1 font-semibold w-28">金額</th>
              <th className="w-12"></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => (
              <tr key={index} className="border-b border-slate-100 last:border-0">
                <td className="py-1 pr-2">
                  <select
                    aria-label="材料区分"
                    value={line.category_code}
                    onChange={e => updateLine(index, { category_code: e.target.value })}
                    className={inputCls}
                  >
                    {options.map(option => (
                      <option key={option.code} value={option.code}>{option.name}</option>
                    ))}
                  </select>
                </td>
                <td className="py-1 pr-2">
                  <input
                    aria-label="材料名"
                    value={line.name}
                    onChange={e => updateLine(index, { name: e.target.value })}
                    className={inputCls}
                    placeholder="材料名"
                  />
                </td>
                <td className="py-1 pr-2">
                  <input
                    aria-label="数量"
                    type="number"
                    value={line.quantity}
                    onChange={e => updateLine(index, { quantity: Number(e.target.value) })}
                    className={inputCls}
                    min="0"
                    step="0.01"
                  />
                </td>
                <td className="py-1 pr-2">
                  <input
                    aria-label="材料単価"
                    type="number"
                    value={line.unit_cost}
                    onChange={e => updateLine(index, { unit_cost: Number(e.target.value) })}
                    className={inputCls}
                    min="0"
                  />
                </td>
                <td className="py-1 pr-2 text-right font-semibold text-slate-700">{moneyText(costAmount(line))}</td>
                <td className="py-1 text-center">
                  <button
                    type="button"
                    onClick={() => removeLine(index)}
                    className="text-xs text-red-500 hover:text-red-700 px-1"
                  >
                    削除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="mt-3">
        <button
          type="button"
          onClick={addLine}
          className="px-3 py-1 bg-slate-100 border border-slate-300 rounded text-xs text-slate-600 hover:bg-slate-50"
        >
          + 行追加
        </button>
      </div>
    </div>
  );
}

export function TateguLaborLinesPanel({ lines, onChange, categories }: LaborLinesProps) {
  const options = categoryOptions(categories, 'time');
  const totalHours = lines.reduce((sum, line) => sum + (Number(line.work_hours) || 0), 0);
  const totalAmount = lines.reduce((sum, line) => sum + laborAmount(line), 0);

  function updateLine(index: number, patch: Partial<LaborLineDraft>) {
    const next = lines.map((line, i) => {
      if (i !== index) return line;
      const updated = { ...line, ...patch };
      return { ...updated, amount: laborAmount(updated) };
    });
    onChange(withLaborOrders(next));
  }

  function addLine() {
    const category = options[0];
    onChange(withLaborOrders([...lines, {
      process_name: '',
      category_code: category?.code ?? 'factory_hours',
      work_hours: 1,
      labor_rate: 0,
      amount: 0,
      sort_order: lines.length,
    }]));
  }

  function removeLine(index: number) {
    onChange(withLaborOrders(lines.filter((_, i) => i !== index)));
  }

  return (
    <div>
      {lines.length > 0 && (
        <div className="flex flex-wrap gap-3 mb-5">
          {options.map(option => {
            const optionHours = lines
              .filter(line => line.category_code === option.code)
              .reduce((sum, line) => sum + (Number(line.work_hours) || 0), 0);
            const optionTotal = lines
              .filter(line => line.category_code === option.code)
              .reduce((sum, line) => sum + laborAmount(line), 0);
            return (
              <div key={option.code} className="flex-1 min-w-28 bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
                <div className="text-xs text-slate-400 mb-1">{option.name}合計</div>
                <div className="font-bold text-sm">{optionHours} h</div>
                <div className="text-xs text-slate-400 mt-0.5">{moneyText(optionTotal)}</div>
              </div>
            );
          })}
          <div className="flex-1 min-w-36 bg-slate-800 text-white rounded-lg px-4 py-3">
            <div className="text-xs text-slate-300 mb-1">労務費合計</div>
            <div className="font-bold text-lg">{moneyText(totalAmount)}</div>
            <div className="text-xs text-slate-300 mt-0.5">{totalHours} h</div>
          </div>
        </div>
      )}

      {lines.length === 0 ? (
        <p className="text-xs text-slate-400">労務明細行がありません。行追加で入力できます。</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-400 border-b border-slate-200">
              <th className="text-left pb-1 font-semibold">工程名</th>
              <th className="text-left pb-1 font-semibold w-28">区分</th>
              <th className="text-left pb-1 font-semibold w-24">工数</th>
              <th className="text-left pb-1 font-semibold w-28">労務単価</th>
              <th className="text-right pb-1 font-semibold w-28">金額</th>
              <th className="w-12"></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => (
              <tr key={index} className="border-b border-slate-100 last:border-0">
                <td className="py-1 pr-2">
                  <input
                    aria-label="工程名"
                    value={line.process_name}
                    onChange={e => updateLine(index, { process_name: e.target.value })}
                    className={inputCls}
                    placeholder="工程名"
                  />
                </td>
                <td className="py-1 pr-2">
                  <select
                    aria-label="労務区分"
                    value={line.category_code}
                    onChange={e => updateLine(index, { category_code: e.target.value })}
                    className={inputCls}
                  >
                    {options.map(option => (
                      <option key={option.code} value={option.code}>{option.name}</option>
                    ))}
                  </select>
                </td>
                <td className="py-1 pr-2">
                  <input
                    aria-label="工数"
                    type="number"
                    value={line.work_hours}
                    onChange={e => updateLine(index, { work_hours: Number(e.target.value) })}
                    className={inputCls}
                    min="0"
                    step="0.01"
                  />
                </td>
                <td className="py-1 pr-2">
                  <input
                    aria-label="労務単価"
                    type="number"
                    value={line.labor_rate}
                    onChange={e => updateLine(index, { labor_rate: Number(e.target.value) })}
                    className={inputCls}
                    min="0"
                  />
                </td>
                <td className="py-1 pr-2 text-right font-semibold text-slate-700">{moneyText(laborAmount(line))}</td>
                <td className="py-1 text-center">
                  <button
                    type="button"
                    onClick={() => removeLine(index)}
                    className="text-xs text-red-500 hover:text-red-700 px-1"
                  >
                    削除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="mt-3">
        <button
          type="button"
          onClick={addLine}
          className="px-3 py-1 bg-slate-100 border border-slate-300 rounded text-xs text-slate-600 hover:bg-slate-50"
        >
          + 行追加
        </button>
      </div>
    </div>
  );
}
