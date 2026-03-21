import type { AggregationCategoryMaster } from '../api/aggregationCategories';
import type { CostBreakdownLine } from '../types/tateguItem';

export type BreakdownDraft = Omit<CostBreakdownLine, 'id' | 'tategu_item_id'>;

interface Props {
  lines: BreakdownDraft[];
  onChange: (lines: BreakdownDraft[]) => void;
  laborRate: number;
  categories: AggregationCategoryMaster[];
}

const inputCls = 'w-full px-2.5 py-1.5 border border-slate-300 rounded-md text-sm focus:outline-none focus:border-blue-400';

function groupByCode(lines: BreakdownDraft[], categories: AggregationCategoryMaster[]) {
  const masterCodes = new Set(categories.map(c => c.code));
  const groups: { code: string; name: string; measure_type: 'money' | 'time'; lines: { line: BreakdownDraft; index: number }[] }[] = [];

  const codeToGroup = new Map<string, (typeof groups)[0]>();

  // masterの順でグループを初期化
  for (const cat of categories) {
    const group = { code: cat.code, name: cat.name, measure_type: cat.measure_type, lines: [] as { line: BreakdownDraft; index: number }[] };
    groups.push(group);
    codeToGroup.set(cat.code, group);
  }

  // その他グループ
  const otherGroup = { code: '__other__', name: 'その他', measure_type: 'money' as const, lines: [] as { line: BreakdownDraft; index: number }[] };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (masterCodes.has(line.category_code)) {
      codeToGroup.get(line.category_code)!.lines.push({ line, index: i });
    } else {
      otherGroup.lines.push({ line, index: i });
    }
  }

  if (otherGroup.lines.length > 0) {
    groups.push(otherGroup);
  }

  return groups.filter(g => g.lines.length > 0);
}

function SummaryCards({ lines, categories, laborRate }: { lines: BreakdownDraft[]; categories: AggregationCategoryMaster[]; laborRate: number }) {
  const moneyTotal = lines.filter(l => l.measure_type === 'money').reduce((s, l) => s + l.value, 0);
  const timeTotal  = lines.filter(l => l.measure_type === 'time').reduce((s, l) => s + l.value, 0);
  const grandTotal = moneyTotal + timeTotal * laborRate;

  const masterCards = categories.map(cat => {
    const catLines = lines.filter(l => l.category_code === cat.code);
    const total = catLines.reduce((s, l) => s + l.value, 0);
    return { cat, total };
  }).filter(({ total }) => total !== 0 || lines.some(l => l.category_code === ''));

  // masterに存在しない区分の合計も表示
  const masterCodes = new Set(categories.map(c => c.code));
  const otherMoney = lines.filter(l => !masterCodes.has(l.category_code) && l.measure_type === 'money').reduce((s, l) => s + l.value, 0);
  const otherTime  = lines.filter(l => !masterCodes.has(l.category_code) && l.measure_type === 'time').reduce((s, l) => s + l.value, 0);

  return (
    <div className="flex flex-wrap gap-3 mb-5">
      {masterCards.map(({ cat, total }) => (
        <div key={cat.code} className="flex-1 min-w-28 bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
          <div className="text-xs text-slate-400 mb-1">{cat.name}合計</div>
          <div className="font-bold text-sm">
            {cat.measure_type === 'money'
              ? `¥${total.toLocaleString()}`
              : `${total} h`}
          </div>
          {cat.measure_type === 'time' && laborRate > 0 && (
            <div className="text-xs text-slate-400 mt-0.5">換算 ¥{(total * laborRate).toLocaleString()}</div>
          )}
        </div>
      ))}
      {(otherMoney > 0 || otherTime > 0) && (
        <div className="flex-1 min-w-28 bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
          <div className="text-xs text-slate-400 mb-1">その他合計</div>
          <div className="font-bold text-sm">
            {otherMoney > 0 && <span>¥{otherMoney.toLocaleString()}</span>}
            {otherTime > 0 && <span>{otherTime} h</span>}
          </div>
        </div>
      )}
      <div className="flex-1 min-w-36 bg-slate-800 text-white rounded-lg px-4 py-3">
        <div className="text-xs text-slate-300 mb-1">原価合計（材料+労務）</div>
        <div className="font-bold text-lg">¥{grandTotal.toLocaleString()}</div>
      </div>
    </div>
  );
}

export default function CostBreakdownPanel({ lines, onChange, laborRate, categories }: Props) {
  const hasMaster = categories.length > 0;

  function updateLine(index: number, field: keyof BreakdownDraft, value: string | number) {
    onChange(lines.map((l, i) => i === index ? { ...l, [field]: value } : l));
  }

  function removeLine(index: number) {
    onChange(lines.filter((_, i) => i !== index));
  }

  function addLine(code?: string) {
    const cat = categories.find(c => c.code === code);
    onChange([...lines, {
      category_code: cat?.code ?? '',
      category_name: cat?.name ?? '',
      measure_type: cat?.measure_type ?? 'money',
      value: 0,
      sort_order: lines.length,
    }]);
  }

  const groups = hasMaster ? groupByCode(lines, categories) : null;

  return (
    <div>
      {lines.length > 0 && (
        <SummaryCards lines={lines} categories={categories} laborRate={laborRate} />
      )}

      {hasMaster ? (
        <>
          {groups && groups.length > 0 ? (
            <div className="space-y-4">
              {groups.map(group => {
                const groupTotal = group.lines.reduce((s, { line }) => s + line.value, 0);
                return (
                  <div key={group.code}>
                    <div className="text-xs font-semibold text-slate-600 mb-1 flex items-center gap-2">
                      <span>■ {group.name}</span>
                      <span className="text-slate-400">
                        {group.measure_type === 'money' ? `¥${groupTotal.toLocaleString()}` : `${groupTotal} h`}
                      </span>
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-slate-400 border-b border-slate-200">
                          <th className="text-left pb-1 font-semibold">名称</th>
                          <th className="text-left pb-1 font-semibold w-20">種別</th>
                          <th className="text-left pb-1 font-semibold w-28">値</th>
                          <th className="w-12"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.lines.map(({ line, index }) => (
                          <tr key={index} className="border-b border-slate-100 last:border-0">
                            <td className="py-1 pr-2">
                              <input
                                value={line.category_name}
                                onChange={e => updateLine(index, 'category_name', e.target.value)}
                                className={inputCls}
                                placeholder="区分名"
                              />
                            </td>
                            <td className="py-1 pr-2">
                              <select
                                value={line.measure_type}
                                onChange={e => updateLine(index, 'measure_type', e.target.value)}
                                className={inputCls}
                              >
                                <option value="money">金額</option>
                                <option value="time">時間</option>
                              </select>
                            </td>
                            <td className="py-1 pr-2">
                              <input
                                type="number"
                                value={line.value}
                                onChange={e => updateLine(index, 'value', Number(e.target.value))}
                                className={inputCls}
                                step="0.01"
                              />
                            </td>
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
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-slate-400">内訳行がありません。</p>
          )}

          <div className="mt-3">
            <select
              className="px-3 py-1.5 border border-slate-300 rounded text-xs text-slate-600 bg-white hover:bg-slate-50 cursor-pointer"
              value=""
              onChange={e => { if (e.target.value) addLine(e.target.value); }}
            >
              <option value="">+ 区分を選んで行追加</option>
              {categories.map(cat => (
                <option key={cat.code} value={cat.code}>{cat.name}</option>
              ))}
            </select>
          </div>
        </>
      ) : (
        <>
          {lines.length === 0 ? (
            <p className="text-xs text-slate-400">内訳行がありません。「+ 行追加」またはカタログ取り込みで追加できます。</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-500 border-b border-slate-200">
                  <th className="text-left pb-1 font-semibold">区分名</th>
                  <th className="text-left pb-1 font-semibold w-20">種別</th>
                  <th className="text-left pb-1 font-semibold w-28">値</th>
                  <th className="w-12"></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, i) => (
                  <tr key={i} className="border-b border-slate-100 last:border-0">
                    <td className="py-1 pr-2">
                      <input
                        value={line.category_name}
                        onChange={e => updateLine(i, 'category_name', e.target.value)}
                        className={inputCls}
                        placeholder="区分名"
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <select
                        value={line.measure_type}
                        onChange={e => updateLine(i, 'measure_type', e.target.value)}
                        className={inputCls}
                      >
                        <option value="money">金額</option>
                        <option value="time">時間</option>
                      </select>
                    </td>
                    <td className="py-1 pr-2">
                      <input
                        type="number"
                        value={line.value}
                        onChange={e => updateLine(i, 'value', Number(e.target.value))}
                        className={inputCls}
                        step="0.01"
                      />
                    </td>
                    <td className="py-1 text-center">
                      <button
                        type="button"
                        onClick={() => removeLine(i)}
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
              onClick={() => addLine()}
              className="px-3 py-1 bg-slate-100 border border-slate-300 rounded text-xs text-slate-600 hover:bg-slate-50"
            >
              + 行追加
            </button>
          </div>
        </>
      )}
    </div>
  );
}
