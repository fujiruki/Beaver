import { useState, useEffect } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { useCostCalcDynamic } from '../../hooks/useCostCalc';
import { useAppSettings } from '../../contexts/AppSettingsContext';
import TateguSelector from './TateguSelector';
import type { TateguItem } from '../../types/tateguItem';
import type { LineCategoryValue } from '../../types/voucher';
import type { VoucherFormValues } from '../../pages/VoucherEdit';
import type { AggregationCategoryMaster } from '../../api/aggregationCategories';

type Props = {
  index: number;
  onRemove: () => void;
  readOnly?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  categories: AggregationCategoryMaster[];
  totalCols: number;
};

export default function LineItemRow({
  index,
  onRemove: _onRemove,
  readOnly = false,
  selected,
  onSelect,
  categories,
  totalCols,
}: Props) {
  const [selectorOpen, setSelectorOpen] = useState(false);
  const { register, setValue, control } = useFormContext<VoucherFormValues>();
  const { settings } = useAppSettings();

  const line = useWatch({ control, name: `lines.${index}` });

  const costs: LineCategoryValue[] = line?.costs ?? [];
  const prices: LineCategoryValue[] = line?.prices ?? [];
  const laborRate = line?.cost_labor_rate ?? 0;
  const quantity = line?.quantity ?? 1;

  const moneyCategories = categories.filter(c => c.measure_type === 'money');
  const timeCategories  = categories.filter(c => c.measure_type === 'time');

  const { manufactureCost, materialCost, laborCost } = useCostCalcDynamic(costs, laborRate);

  // line_total = sum(prices) * quantity
  useEffect(() => {
    const unitPrice = prices.reduce((s, p) => s + (p.value || 0), 0);
    setValue(`lines.${index}.line_total`, unitPrice * quantity);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(prices), quantity, index, setValue]);

  function getCostValue(code: string): number {
    return costs.find(c => c.category_code === code)?.value ?? 0;
  }
  function getPriceValue(code: string): number {
    return prices.find(c => c.category_code === code)?.value ?? 0;
  }

  function setCostValue(code: string, raw: string) {
    const value = parseFloat(raw) || 0;
    const cat = categories.find(c => c.code === code);
    if (!cat) return;
    const updated = costs.filter(c => c.category_code !== code);
    if (value !== 0) {
      updated.push({
        category_code: code,
        category_name: cat.name,
        measure_type: cat.measure_type,
        value,
        sort_order: cat.sort_order,
      });
      updated.sort((a, b) => a.sort_order - b.sort_order);
    }
    setValue(`lines.${index}.costs`, updated);
  }

  function setPriceValue(code: string, raw: string) {
    const value = parseFloat(raw) || 0;
    const cat = categories.find(c => c.code === code);
    if (!cat) return;
    const updated = prices.filter(c => c.category_code !== code);
    if (value !== 0) {
      updated.push({
        category_code: code,
        category_name: cat.name,
        measure_type: cat.measure_type,
        value,
        sort_order: cat.sort_order,
      });
      updated.sort((a, b) => a.sort_order - b.sort_order);
    }
    setValue(`lines.${index}.prices`, updated);
  }

  function handleTateguSelect(item: TateguItem) {
    setValue(`lines.${index}.tategu_item_id`, item.id);
    setValue(`lines.${index}.item_name`, item.name);
    setValue(`lines.${index}.cost_body`, item.cost_body);
    setValue(`lines.${index}.cost_hardware`, item.cost_hardware);
    setValue(`lines.${index}.cost_glass`, item.cost_glass);
    setValue(`lines.${index}.cost_factory_hours`, item.cost_factory_hours);
    setValue(`lines.${index}.cost_site_hours`, item.cost_site_hours);
    setValue(`lines.${index}.cost_labor_rate`, item.cost_labor_rate);
    setValue(`lines.${index}.snapshot_loaded_at`, new Date().toISOString());

    if (item.cost_breakdown && item.cost_breakdown.length > 0) {
      const newCosts: LineCategoryValue[] = item.cost_breakdown.map(bd => ({
        category_code: bd.category_code,
        category_name: bd.category_name,
        measure_type: bd.measure_type,
        value: bd.value,
        sort_order: bd.sort_order,
      }));
      setValue(`lines.${index}.costs`, newCosts);
    }
  }

  const lineType = line?.line_type ?? 'normal';
  const unitPrice = prices.reduce((s, p) => s + (p.value || 0), 0);
  const lineTotal = unitPrice * quantity;
  const mfgCostTotal = manufactureCost * quantity;
  const materialCostTotal = materialCost * quantity;
  const laborCostTotal = laborCost * quantity;
  const grossProfit = lineTotal - mfgCostTotal;
  const grossProfitRate = lineTotal > 0 ? grossProfit / lineTotal : 0;
  const grossMarginRate = lineTotal > 0 ? (lineTotal - materialCostTotal) / lineTotal : 0;
  const totalTimeHours = costs.filter(c => c.measure_type === 'time').reduce((s, c) => s + (c.value || 0), 0) * quantity;
  const dailyProfit = totalTimeHours > 0 ? grossProfit / totalTimeHours * settings.hoursPerDay : null;

  const rowBg = selected ? '#eff6ff' : 'transparent';

  // カテゴリが未同期の場合は固定列の旧UI描画
  if (categories.length === 0) {
    return <LegacyRow index={index} readOnly={readOnly} selected={selected} onSelect={onSelect} />;
  }

  return (
    <>
      <tr style={{ background: rowBg, cursor: 'pointer' }} onClick={onSelect}>
        {/* No */}
        <td style={tdStyle}>
          <span style={{ fontSize: 11, color: '#94a3b8' }}>{(line?.line_no ?? index + 1)}</span>
        </td>
        {/* 取付場所 */}
        <td style={tdStyle}>
          {lineType === 'normal' && (
            <input {...register(`lines.${index}.location_name`)} placeholder="場所"
              style={{ ...cellInputStyle, width: 72 }} disabled={readOnly} />
          )}
        </td>
        {/* 内容 */}
        <td style={tdStyle}>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <select {...register(`lines.${index}.line_type`)} style={{ ...cellInputStyle, width: 58 }} disabled={readOnly}>
              <option value="normal">通常</option>
              <option value="discount">値引</option>
              <option value="subtotal">小計</option>
            </select>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 2 }}>
              {line?.tategu_item_id && <span title="建具台帳から引用" style={{ fontSize: 12 }}>🔨</span>}
              {line?.source_catalog_item_id && <span title="カタログから引用" style={{ fontSize: 12 }}>📦</span>}
              <input {...register(`lines.${index}.item_name`)} placeholder="品名"
                style={{ ...cellInputStyle, width: 120 }} disabled={readOnly} />
            </div>
            {!readOnly && lineType === 'normal' && (
              <button type="button" onClick={e => { e.stopPropagation(); setSelectorOpen(true); }} style={selectBtnStyle} title="建具台帳から選択">
                📋
              </button>
            )}
          </div>
          {!readOnly && (
            <TateguSelector isOpen={selectorOpen} onClose={() => setSelectorOpen(false)} onSelect={handleTateguSelect} />
          )}
        </td>
        {/* 数量 */}
        <td style={tdStyle}>
          <input type="number" {...register(`lines.${index}.quantity`, { valueAsNumber: true })}
            style={{ ...cellInputStyle, width: 52 }} disabled={readOnly} />
        </td>
        {/* 売値 money型区分 */}
        {moneyCategories.map((cat, ci) => (
          <td key={`p-${cat.code}`} style={{ ...tdStyle, borderLeft: ci === 0 ? '2px solid #bfdbfe' : undefined }}>
            {lineType === 'normal' && (
              <input
                type="number"
                value={getPriceValue(cat.code)}
                onChange={e => setPriceValue(cat.code, e.target.value)}
                style={{ ...cellInputStyle, width: 72 }}
                disabled={readOnly}
                placeholder={cat.name}
              />
            )}
          </td>
        ))}
        {/* 単価合計 */}
        <td style={{ ...tdStyle, textAlign: 'right' }}>
          {lineType === 'normal' && (
            <span style={{ fontSize: 12, color: '#475569' }}>¥{unitPrice.toLocaleString()}</span>
          )}
        </td>
        {/* 金額 */}
        <td style={{ ...tdStyle, textAlign: 'right' }}>
          {lineType === 'discount' ? (
            <input type="number" {...register(`lines.${index}.line_total`, { valueAsNumber: true })}
              style={{ ...cellInputStyle, width: 88, textAlign: 'right' }} disabled={readOnly} />
          ) : (
            <span style={{ fontSize: 13, fontWeight: lineType === 'normal' ? 'normal' : 'bold' }}>
              ¥{lineTotal.toLocaleString()}
            </span>
          )}
        </td>
        {/* 課税 */}
        <td style={tdStyle}>
          {lineType === 'normal' && (
            <select {...register(`lines.${index}.tax_category`)} style={{ ...cellInputStyle, width: 68 }} disabled={readOnly}>
              <option value="taxable">課税</option>
              <option value="non_taxable">非課税</option>
            </select>
          )}
        </td>
        {/* 原価 money型区分 */}
        {moneyCategories.map((cat, ci) => (
          <td key={`c-${cat.code}`} style={{ ...tdStyle, borderLeft: ci === 0 ? '2px solid #d1fae5' : undefined }}>
            {lineType === 'normal' && (
              <input
                type="number"
                value={getCostValue(cat.code)}
                onChange={e => setCostValue(cat.code, e.target.value)}
                style={{ ...cellInputStyle, width: 72 }}
                disabled={readOnly}
                placeholder={cat.name}
              />
            )}
          </td>
        ))}
        {/* 時間 time型区分 */}
        {timeCategories.map(cat => (
          <td key={`t-${cat.code}`} style={tdStyle}>
            {lineType === 'normal' && (
              <input
                type="number"
                value={getCostValue(cat.code)}
                onChange={e => setCostValue(cat.code, e.target.value)}
                style={{ ...cellInputStyle, width: 52 }}
                step="0.5"
                disabled={readOnly}
                placeholder={cat.name}
              />
            )}
          </td>
        ))}
        {/* 労務単価 */}
        <td style={tdStyle}>
          {lineType === 'normal' && (
            <input type="number" {...register(`lines.${index}.cost_labor_rate`, { valueAsNumber: true })}
              style={{ ...cellInputStyle, width: 64 }} disabled={readOnly} />
          )}
        </td>
        {/* 労務費 */}
        <td style={{ ...tdStyle, textAlign: 'right' }}>
          {lineType === 'normal' && (
            <span style={{ fontSize: 12, color: '#64748b' }}>¥{Math.round(laborCostTotal).toLocaleString()}</span>
          )}
        </td>
        {/* 材料原価 */}
        <td style={{ ...tdStyle, textAlign: 'right' }}>
          {lineType === 'normal' && (
            <span style={{ fontSize: 12, color: '#64748b' }}>¥{Math.round(materialCostTotal).toLocaleString()}</span>
          )}
        </td>
        {/* 製造原価 */}
        <td style={{ ...tdStyle, textAlign: 'right' }}>
          {lineType === 'normal' && (
            <span style={{ fontSize: 12, color: '#64748b' }}>¥{Math.round(mfgCostTotal).toLocaleString()}</span>
          )}
        </td>
        {/* 利益 */}
        <td style={{ ...tdStyle, textAlign: 'right' }}>
          {lineType === 'normal' && (
            <span style={{ fontSize: 12, color: grossProfit >= 0 ? '#16a34a' : '#dc2626' }}>
              ¥{Math.round(grossProfit).toLocaleString()}
            </span>
          )}
        </td>
        {/* 利益率 */}
        <td style={{ ...tdStyle, textAlign: 'right' }}>
          {lineType === 'normal' && (
            <span style={{ fontSize: 12, color: grossProfitRate >= 0.3 ? '#16a34a' : grossProfitRate >= 0.2 ? '#d97706' : '#dc2626' }}>
              {(grossProfitRate * 100).toFixed(1)}%
            </span>
          )}
        </td>
        {/* 粗利率 */}
        <td style={{ ...tdStyle, textAlign: 'right' }}>
          {lineType === 'normal' && (
            <span style={{ fontSize: 12, color: '#64748b' }}>
              {(grossMarginRate * 100).toFixed(1)}%
            </span>
          )}
        </td>
        {/* 日割粗利 */}
        <td style={{ ...tdStyle, textAlign: 'right' }}>
          {lineType === 'normal' && dailyProfit !== null && (
            <span style={{ fontSize: 12, color: '#64748b' }}>
              ¥{Math.round(dailyProfit).toLocaleString()}/日
            </span>
          )}
        </td>
        {/* 選択ラジオ */}
        <td style={tdStyle} onClick={e => e.stopPropagation()}>
          <input type="radio" checked={selected} onChange={() => onSelect?.()}
            style={{ cursor: 'pointer' }} />
        </td>
      </tr>
      {/* 備考行 */}
      <tr style={{ background: rowBg }}>
        <td colSpan={totalCols} style={{ padding: '2px 4px 6px' }}>
          <input
            {...register(`lines.${index}.memo`)}
            placeholder="備考"
            style={{ ...cellInputStyle, width: '100%', fontSize: 12, color: '#64748b' }}
            disabled={readOnly}
          />
        </td>
      </tr>
    </>
  );
}

/** カテゴリ未同期時のフォールバック表示（旧UI） */
function LegacyRow({
  index,
  readOnly,
  selected,
  onSelect,
}: {
  index: number;
  readOnly: boolean;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const [selectorOpen, setSelectorOpen] = useState(false);
  const { register, setValue, control } = useFormContext<VoucherFormValues>();
  const line = useWatch({ control, name: `lines.${index}` });

  useEffect(() => {
    const unitPrice = (line?.price_body ?? 0) + (line?.price_hardware ?? 0) + (line?.price_glass ?? 0);
    setValue(`lines.${index}.line_total`, unitPrice * (line?.quantity ?? 1));
  }, [line?.price_body, line?.price_hardware, line?.price_glass, line?.quantity, index, setValue]);

  function handleTateguSelect(item: TateguItem) {
    setValue(`lines.${index}.tategu_item_id`, item.id);
    setValue(`lines.${index}.item_name`, item.name);
    setValue(`lines.${index}.cost_body`, item.cost_body);
    setValue(`lines.${index}.cost_hardware`, item.cost_hardware);
    setValue(`lines.${index}.cost_glass`, item.cost_glass);
    setValue(`lines.${index}.cost_factory_hours`, item.cost_factory_hours);
    setValue(`lines.${index}.cost_site_hours`, item.cost_site_hours);
    setValue(`lines.${index}.cost_labor_rate`, item.cost_labor_rate);
    setValue(`lines.${index}.snapshot_loaded_at`, new Date().toISOString());
  }

  const lineType = line?.line_type ?? 'normal';
  const unitPrice = (line?.price_body ?? 0) + (line?.price_hardware ?? 0) + (line?.price_glass ?? 0);
  const lineTotal = unitPrice * (line?.quantity ?? 1);
  const laborCost = ((line?.cost_factory_hours ?? 0) + (line?.cost_site_hours ?? 0)) * (line?.cost_labor_rate ?? 0);
  const mfgCost = (line?.cost_body ?? 0) + (line?.cost_hardware ?? 0) + (line?.cost_glass ?? 0) + laborCost;
  const grossProfit = lineTotal - mfgCost * (line?.quantity ?? 1);
  const grossProfitRate = lineTotal > 0 ? grossProfit / lineTotal : 0;
  const rowBg = selected ? '#eff6ff' : 'transparent';

  return (
    <tr style={{ background: rowBg, cursor: 'pointer' }} onClick={onSelect}>
      <td style={tdStyle} />
      <td style={tdStyle}>
        {lineType === 'normal' && (
          <input {...register(`lines.${index}.location_name`)} placeholder="場所"
            style={{ ...cellInputStyle, width: 76 }} disabled={readOnly} />
        )}
      </td>
      <td style={tdStyle}>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <select {...register(`lines.${index}.line_type`)} style={{ ...cellInputStyle, width: 58 }} disabled={readOnly}>
            <option value="normal">通常</option>
            <option value="discount">値引</option>
            <option value="subtotal">小計</option>
          </select>
          <input {...register(`lines.${index}.item_name`)} placeholder="品名"
            style={{ ...cellInputStyle, flex: 1, minWidth: 120 }} disabled={readOnly} />
          {!readOnly && lineType === 'normal' && (
            <button type="button" onClick={e => { e.stopPropagation(); setSelectorOpen(true); }} style={selectBtnStyle} title="建具台帳から選択">
              📋
            </button>
          )}
        </div>
        {!readOnly && (
          <TateguSelector isOpen={selectorOpen} onClose={() => setSelectorOpen(false)} onSelect={handleTateguSelect} />
        )}
      </td>
      <td style={tdStyle}>
        <input type="number" {...register(`lines.${index}.quantity`, { valueAsNumber: true })}
          style={{ ...cellInputStyle, width: 56 }} disabled={readOnly} />
      </td>
      <td style={{ ...tdStyle, textAlign: 'right' }}>
        {lineType === 'normal' && <span style={{ fontSize: 12 }}>¥{unitPrice.toLocaleString()}</span>}
      </td>
      <td style={{ ...tdStyle, textAlign: 'right' }}>
        {lineType === 'discount' ? (
          <input type="number" {...register(`lines.${index}.line_total`, { valueAsNumber: true })}
            style={{ ...cellInputStyle, width: 96, textAlign: 'right' }} disabled={readOnly} />
        ) : (
          <span style={{ fontSize: 13 }}>¥{lineTotal.toLocaleString()}</span>
        )}
      </td>
      <td style={tdStyle}>
        {lineType === 'normal' && (
          <select {...register(`lines.${index}.tax_category`)} style={{ ...cellInputStyle, width: 68 }} disabled={readOnly}>
            <option value="taxable">課税</option>
            <option value="non_taxable">非課税</option>
          </select>
        )}
      </td>
      <td style={tdStyle}>
        {lineType === 'normal' && (
          <input type="number" {...register(`lines.${index}.price_body`, { valueAsNumber: true })}
            style={{ ...cellInputStyle, width: 76 }} placeholder="本体" disabled={readOnly} />
        )}
      </td>
      <td style={tdStyle}>
        {lineType === 'normal' && (
          <input type="number" {...register(`lines.${index}.price_hardware`, { valueAsNumber: true })}
            style={{ ...cellInputStyle, width: 76 }} placeholder="金物" disabled={readOnly} />
        )}
      </td>
      <td style={tdStyle}>
        {lineType === 'normal' && (
          <input type="number" {...register(`lines.${index}.price_glass`, { valueAsNumber: true })}
            style={{ ...cellInputStyle, width: 76 }} placeholder="ガラス" disabled={readOnly} />
        )}
      </td>
      <td style={tdStyle}>
        {lineType === 'normal' && (
          <input type="number" {...register(`lines.${index}.cost_factory_hours`, { valueAsNumber: true })}
            style={{ ...cellInputStyle, width: 56 }} step="0.5" disabled={readOnly} />
        )}
      </td>
      <td style={tdStyle}>
        {lineType === 'normal' && (
          <input type="number" {...register(`lines.${index}.cost_site_hours`, { valueAsNumber: true })}
            style={{ ...cellInputStyle, width: 56 }} step="0.5" disabled={readOnly} />
        )}
      </td>
      <td style={{ ...tdStyle, textAlign: 'right' }}>
        {lineType === 'normal' && <span style={{ fontSize: 12, color: '#64748b' }}>¥{Math.round(laborCost).toLocaleString()}</span>}
      </td>
      <td style={{ ...tdStyle, textAlign: 'right' }}>
        {lineType === 'normal' && <span style={{ fontSize: 12, color: '#64748b' }}>¥{Math.round(mfgCost).toLocaleString()}</span>}
      </td>
      <td style={{ ...tdStyle, textAlign: 'right' }}>
        {lineType === 'normal' && (
          <span style={{ fontSize: 12, color: grossProfit >= 0 ? '#16a34a' : '#dc2626' }}>
            ¥{Math.round(grossProfit).toLocaleString()}
          </span>
        )}
      </td>
      <td style={{ ...tdStyle, textAlign: 'right' }}>
        {lineType === 'normal' && (
          <span style={{ fontSize: 12, color: grossProfitRate >= 0.3 ? '#16a34a' : grossProfitRate >= 0.2 ? '#d97706' : '#dc2626' }}>
            {(grossProfitRate * 100).toFixed(1)}%
          </span>
        )}
      </td>
      <td style={tdStyle} onClick={e => e.stopPropagation()}>
        <input type="radio" checked={selected} onChange={() => onSelect?.()}
          style={{ cursor: 'pointer' }} />
      </td>
    </tr>
  );
}

const tdStyle: React.CSSProperties = {
  padding: '6px 4px', verticalAlign: 'middle',
};
const cellInputStyle: React.CSSProperties = {
  padding: '5px 6px', border: '1px solid #cbd5e1', borderRadius: 4, fontSize: 13,
  boxSizing: 'border-box',
};
const selectBtnStyle: React.CSSProperties = {
  padding: '4px 6px', background: '#f1f5f9', border: '1px solid #cbd5e1',
  borderRadius: 4, cursor: 'pointer', fontSize: 14, flexShrink: 0,
};
