import { useCallback, useEffect, useRef, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { useCostCalcDynamic } from '../../hooks/useCostCalc';
import { useAppSettings } from '../../contexts/AppSettingsContext';
import TateguSelector from './TateguSelector';
import ProductLedgerModal from './ProductLedgerModal';
import type { TateguItem } from '../../types/tateguItem';
import type { LineCategoryValue } from '../../types/voucher';
import type { VoucherFormValues } from '../../pages/VoucherEdit';
import type { AggregationCategoryMaster } from '../../api/aggregationCategories';
import { calcLineProfitSummary } from '../../lib/voucherCalc';
import {
  createCategoryGridTemplate,
  getLineItemRightWidth,
  getLineItemWidth,
  LINE_ITEM_LEFT_WIDTH,
  LINE_ITEM_NO_WIDTH,
  LINE_ITEM_PROFIT_WIDTH,
  LINE_TYPE_SELECT_WIDTH,
} from './lineItemLayout';

type Props = {
  index: number;
  readOnly?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  categories: AggregationCategoryMaster[];
  isNew: boolean;
  onSaveLine: (lineId: number, data: Record<string, unknown>) => Promise<void>;
  voucherLabel?: string;
};

const formatNumber = (value: number | null | undefined) =>
  Number.isFinite(Number(value)) ? Number(value).toLocaleString('ja-JP', { maximumFractionDigits: 10 }) : '';

const parseNumber = (value: string) => Number(value.replace(/,/g, '')) || 0;
const formatWorkCategoryName = (name: string) => name.replace(/時間$/, 'h');

type FormattedNumberInputProps = {
  label: string;
  placeholder?: string;
  value: number;
  onValueChange: (raw: string) => void;
  onBlur: () => void;
  disabled: boolean;
  width: number;
  grouped?: boolean;
};

function FormattedNumberInput({ label, placeholder, value, onValueChange, onBlur, disabled, width, grouped = false }: FormattedNumberInputProps) {
  const [displayValue, setDisplayValue] = useState(() => formatNumber(value));
  const focusedRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current) setDisplayValue(formatNumber(value));
  }, [value]);

  return (
    <input
      aria-label={label}
      placeholder={placeholder}
      inputMode="decimal"
      value={displayValue}
      onFocus={() => { focusedRef.current = true; }}
      onChange={event => {
        const raw = event.target.value;
        setDisplayValue(raw === '' ? '' : formatNumber(parseNumber(raw)));
        onValueChange(raw);
      }}
      onBlur={() => {
        focusedRef.current = false;
        setDisplayValue(formatNumber(value));
        onBlur();
      }}
      disabled={disabled}
      style={{ ...(grouped ? groupedInputStyle : inputStyle), width, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
    />
  );
}

export default function LineItemRow({
  index,
  readOnly = false,
  selected,
  onSelect,
  categories,
  isNew,
  onSaveLine,
  voucherLabel = '伝票',
}: Props) {
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [ledgerMode, setLedgerMode] = useState<'create' | 'edit' | null>(null);
  const [ledgerMenuOpen, setLedgerMenuOpen] = useState(false);
  const [memoOpen, setMemoOpen] = useState(false);
  const { register, setValue, getValues, control } = useFormContext<VoucherFormValues>();
  const { settings } = useAppSettings();
  const line = useWatch({ control, name: `lines.${index}` });
  const costs: LineCategoryValue[] = line?.costs ?? [];
  const prices: LineCategoryValue[] = line?.prices ?? [];
  const laborRate = line?.cost_labor_rate ?? 0;
  const quantity = line?.quantity ?? 1;
  const moneyCategories = categories.filter(category => category.measure_type === 'money');
  const timeCategories = categories.filter(category => category.measure_type === 'time');
  const categoryGridTemplate = createCategoryGridTemplate(moneyCategories.length, timeCategories.length);
  const rightWidth = getLineItemRightWidth(moneyCategories.length, timeCategories.length);
  const { manufactureCost, materialCost, laborCost } = useCostCalcDynamic(costs, laborRate);

  useEffect(() => {
    const unitPrice = prices.reduce((sum, price) => sum + (price.value || 0), 0);
    setValue(`lines.${index}.line_total`, unitPrice * quantity);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(prices), quantity, index, setValue]);

  useEffect(() => {
    if (line?.memo) setMemoOpen(true);
  }, [line?.memo]);

  const getValue = (values: LineCategoryValue[], code: string) =>
    values.find(value => value.category_code === code)?.value ?? 0;

  function setCategoryValue(kind: 'costs' | 'prices', category: AggregationCategoryMaster, raw: string) {
    const current = kind === 'costs' ? costs : prices;
    const value = parseNumber(raw);
    const updated = current.filter(item => item.category_code !== category.code);
    if (value !== 0) {
      updated.push({
        category_code: category.code,
        category_name: category.name,
        measure_type: category.measure_type,
        value,
        sort_order: category.sort_order,
      });
      updated.sort((a, b) => a.sort_order - b.sort_order);
    }
    setValue(`lines.${index}.${kind}`, updated);
  }

  const saveLineToDb = useCallback(() => {
    if (isNew) return;
    const current = getValues(`lines.${index}`);
    if (!current?.id) return;
    void onSaveLine(current.id, {
      location_name: current.location_name,
      item_name: current.item_name,
      line_type: current.line_type,
      quantity: current.quantity,
      cost_labor_rate: current.cost_labor_rate,
      line_total: current.line_total,
      tax_category: current.tax_category,
      memo: current.memo,
      costs: current.costs,
      prices: current.prices,
    });
  }, [isNew, getValues, index, onSaveLine]);

  function handleTateguSelect(item: TateguItem) {
    const snapshotCosts: LineCategoryValue[] = item.cost_breakdown?.length
      ? item.cost_breakdown.map(value => ({ ...value }))
      : categories.map(category => {
          let value = 0;
          if (category.code === 'MAIN' || category.code === 'body') value = item.cost_body;
          if (category.code === 'HARDWARE' || category.code === 'hardware') value = item.cost_hardware;
          if (category.code === 'GLASS' || category.code === 'glass') value = item.cost_glass;
          if (category.code === 'FACTORY_TIME') value = item.cost_factory_hours;
          if (category.code === 'SITE_TIME') value = item.cost_site_hours;
          return {
            category_code: category.code,
            category_name: category.name,
            measure_type: category.measure_type,
            value,
            sort_order: category.sort_order,
          };
        }).filter(value => value.value !== 0);
    setValue(`lines.${index}.tategu_item_id`, item.id);
    setValue(`lines.${index}.item_name`, item.name);
    setValue(`lines.${index}.cost_body`, item.cost_body);
    setValue(`lines.${index}.cost_hardware`, item.cost_hardware);
    setValue(`lines.${index}.cost_glass`, item.cost_glass);
    setValue(`lines.${index}.cost_factory_hours`, item.cost_factory_hours);
    setValue(`lines.${index}.cost_site_hours`, item.cost_site_hours);
    setValue(`lines.${index}.cost_labor_rate`, item.cost_labor_rate);
    setValue(`lines.${index}.snapshot_loaded_at`, new Date().toISOString());
    setValue(`lines.${index}.costs`, snapshotCosts);
    if (!isNew) {
      const current = getValues(`lines.${index}`);
      if (current?.id) {
        void onSaveLine(current.id, {
          tategu_item_id: item.id,
          item_name: item.name,
          cost_body: item.cost_body,
          cost_hardware: item.cost_hardware,
          cost_glass: item.cost_glass,
          cost_factory_hours: item.cost_factory_hours,
          cost_site_hours: item.cost_site_hours,
          cost_labor_rate: item.cost_labor_rate,
          costs: snapshotCosts,
          snapshot_loaded_at: new Date().toISOString(),
        });
      }
    }
  }

  function applyLedger(item: TateguItem) {
    handleTateguSelect(item);
  }

  function unlinkLedger() {
    setValue(`lines.${index}.tategu_item_id`, null);
    setLedgerMenuOpen(false);
    if (!isNew) {
      const current = getValues(`lines.${index}`);
      if (current?.id) void onSaveLine(current.id, { tategu_item_id: null });
    }
  }

  const lineType = line?.line_type ?? 'normal';
  const unitPrice = prices.reduce((sum, price) => sum + (price.value || 0), 0);
  const lineTotal = unitPrice * quantity;
  const manufactureCostTotal = manufactureCost * quantity;
  const materialCostTotal = materialCost * quantity;
  const laborCostTotal = laborCost * quantity;
  const totalTimeHours = costs
    .filter(cost => cost.measure_type === 'time')
    .reduce((sum, cost) => sum + (cost.value || 0), 0) * quantity;
  const summary = calcLineProfitSummary(
    lineTotal,
    materialCostTotal,
    laborCostTotal,
    totalTimeHours,
    settings.hoursPerDay,
  );
  const rowBackground = selected ? '#eff6ff' : '#fff';

  const numericInput = (
    label: string,
    value: number,
    onChange: (raw: string) => void,
    width = 72,
    placeholder?: string,
    grouped = false,
  ) => (
    <FormattedNumberInput
      label={label}
      placeholder={placeholder}
      value={value}
      onValueChange={onChange}
      onBlur={saveLineToDb}
      disabled={readOnly}
      width={width}
      grouped={grouped}
    />
  );

  return (
    <div
      data-testid={`line-item-${index}`}
      onClick={onSelect}
      style={{
        display: 'flex',
        alignItems: 'stretch',
        width: 'fit-content',
        minWidth: getLineItemWidth(moneyCategories.length, timeCategories.length),
        padding: '3px 0',
        borderBottom: '1px solid #d0d7de',
        background: rowBackground,
        cursor: 'pointer',
        fontSize: 12,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      <div style={{ width: LINE_ITEM_NO_WIDTH, padding: '2px 4px', boxSizing: 'border-box', textAlign: 'center' }}>
        <div style={{ color: '#64748b', fontSize: 11 }}>{line?.line_no ?? index + 1}</div>
        <input
          aria-label={`${line?.line_no ?? index + 1}行目を選択`}
          type="radio"
          checked={selected}
          onChange={onSelect}
          onClick={event => event.stopPropagation()}
        />
      </div>

      <div data-testid="line-item-left" style={{ width: LINE_ITEM_LEFT_WIDTH, paddingRight: 6, boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 3 }}>
          <select
            aria-label="行種別"
            {...register(`lines.${index}.line_type`)}
            disabled={readOnly}
            onBlur={saveLineToDb}
            style={{ ...inputStyle, width: LINE_TYPE_SELECT_WIDTH }}
          >
            <option value="normal">通常</option>
            <option value="discount">値引</option>
            <option value="subtotal">小計</option>
          </select>
          <textarea
            aria-label="取付製品"
            placeholder="品名"
            {...register(`lines.${index}.item_name`)}
            maxLength={255}
            disabled={readOnly}
            onBlur={saveLineToDb}
            rows={3}
            style={{ ...inputStyle, width: 222, height: 45, lineHeight: '15px', resize: 'none' }}
          />
          {!readOnly && lineType === 'normal' && <div style={{ position: 'relative', display: 'flex' }}>
            <button
              type="button"
              onClick={event => {
                event.stopPropagation();
                if (line?.tategu_item_id) setLedgerMode('edit');
                else setLedgerMenuOpen(open => !open);
              }}
              style={ledgerButtonStyle}
            >
              {line?.tategu_item_id ? '台帳を直す' : '製品台帳'}
            </button>
            {line?.tategu_item_id && (
              <button
                type="button"
                aria-label="製品台帳メニュー"
                onClick={event => {
                  event.stopPropagation();
                  setLedgerMenuOpen(open => !open);
                }}
                style={ledgerArrowStyle}
              >
                ▼
              </button>
            )}
            {ledgerMenuOpen && (
              <div style={ledgerMenuStyle}>
                {!line?.tategu_item_id && (
                  <button
                    type="button"
                    onClick={() => {
                      setLedgerMode('create');
                      setLedgerMenuOpen(false);
                    }}
                  >
                    新しく作る
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setSelectorOpen(true);
                    setLedgerMenuOpen(false);
                  }}
                >
                  {line?.tategu_item_id ? '別の台帳を選ぶ' : '台帳から選ぶ'}
                </button>
                {line?.tategu_item_id && (
                  <button type="button" onClick={unlinkLedger}>
                    紐付けを外す
                  </button>
                )}
              </div>
            )}
          </div>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
          <div data-testid="location-quantity-group" style={joinedGroupStyle}>
            <input
              aria-label="取付場所"
              placeholder="取付場所"
              {...register(`lines.${index}.location_name`)}
              maxLength={255}
              disabled={readOnly || lineType !== 'normal'}
              onBlur={saveLineToDb}
              style={{ ...groupedInputStyle, width: 170 }}
            />
            <span style={joinedCellStyle}>
              {numericInput('数量', quantity, raw => setValue(`lines.${index}.quantity`, parseNumber(raw)), 56, undefined, true)}
            </span>
          </div>
          <button
            type="button"
            onClick={event => { event.stopPropagation(); setMemoOpen(open => !open); }}
            style={memoButtonStyle}
          >備考 {memoOpen ? '−' : '＋'}</button>
        </div>
        {!readOnly && <TateguSelector isOpen={selectorOpen} onClose={() => setSelectorOpen(false)} onSelect={handleTateguSelect} />}
        {!readOnly && ledgerMode && (
          <ProductLedgerModal
            isOpen
            mode={ledgerMode}
            itemId={line?.tategu_item_id}
            voucherLabel={voucherLabel}
            lineNo={line?.line_no ?? index + 1}
            initialName={line?.item_name ?? ''}
            categories={categories}
            onClose={() => setLedgerMode(null)}
            onApplied={applyLedger}
          />
        )}
      </div>

      <div data-testid="line-item-right" style={{ width: rightWidth }}>
        {lineType === 'normal' ? (
          <>
            <div data-testid={`category-grid-row-${index}`} style={{ ...bandStyle, gridTemplateColumns: categoryGridTemplate, background: '#eef6ee' }}>
              <span style={{ ...bandLabelStyle, color: '#2f6f3a' }}>売値</span>
              <div data-testid="price-group" style={{ ...joinedGroupStyle, gridColumn: `2 / span ${moneyCategories.length}` }}>
                {moneyCategories.map(category => (
                  <span key={category.code} style={joinedCellStyle}>
                    {numericInput(`売値 ${category.name}`, getValue(prices, category.code), raw => setCategoryValue('prices', category, raw), 72, category.name, true)}
                  </span>
                ))}
              </div>
              <div data-testid="tax-group" style={{ ...joinedGroupStyle, gridColumn: `${moneyCategories.length + 2} / span ${timeCategories.length + 1}`, width: 162 }}>
                <select
                  aria-label="課税"
                  {...register(`lines.${index}.tax_category`)}
                  disabled={readOnly}
                  onBlur={saveLineToDb}
                  style={{ ...groupedInputStyle, width: 162 }}
                >
                  <option value="taxable">課税</option>
                  <option value="non_taxable">非課税</option>
                </select>
              </div>
              <div style={{ ...resultStyle, gridColumn: moneyCategories.length + timeCategories.length + 3 }}>
                <span style={mutedResultStyle}>単価 ¥{formatNumber(unitPrice)}</span>
                <strong>金額 ¥{formatNumber(lineTotal)}</strong>
              </div>
            </div>
            <div style={{ ...bandStyle, gridTemplateColumns: categoryGridTemplate, background: '#fdf3e7' }}>
              <span style={{ ...bandLabelStyle, color: '#9a5b13' }}>原価・作業</span>
              <div data-testid="cost-group" style={{ ...joinedGroupStyle, gridColumn: `2 / span ${moneyCategories.length}` }}>
                {moneyCategories.map(category => (
                  <span key={category.code} style={joinedCellStyle}>
                    {numericInput(`原価 ${category.name}`, getValue(costs, category.code), raw => setCategoryValue('costs', category, raw), 72, category.name, true)}
                  </span>
                ))}
              </div>
              <div data-testid="work-group" style={{ ...joinedGroupStyle, gridColumn: `${moneyCategories.length + 2} / span ${timeCategories.length + 1}` }}>
                {timeCategories.map(category => (
                  <span key={category.code} style={joinedCellStyle}>
                    {numericInput(formatWorkCategoryName(category.name), getValue(costs, category.code), raw => setCategoryValue('costs', category, raw), 54, undefined, true)}
                  </span>
                ))}
                <span style={joinedCellStyle}>
                  {numericInput('労務単価', laborRate, raw => setValue(`lines.${index}.cost_labor_rate`, parseNumber(raw)), 72, undefined, true)}
                </span>
              </div>
              <div style={{ ...resultStyle, gridColumn: moneyCategories.length + timeCategories.length + 3 }}>
                <span style={mutedResultStyle}>材料原価 ¥{formatNumber(Math.round(materialCostTotal))}</span>
                <span style={mutedResultStyle}>労務費 ¥{formatNumber(Math.round(laborCostTotal))}</span>
                <strong>製造原価 ¥{formatNumber(Math.round(manufactureCostTotal))}</strong>
              </div>
            </div>
          </>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', height: 48, paddingLeft: 8 }}>
            {lineType === 'discount' ? numericInput('金額', line?.line_total ?? 0, raw => setValue(`lines.${index}.line_total`, parseNumber(raw)), 100) : <strong>小計行</strong>}
          </div>
        )}
        {memoOpen && (
          <input
            aria-label="備考"
            {...register(`lines.${index}.memo`)}
            maxLength={255}
            disabled={readOnly}
            onBlur={saveLineToDb}
            style={{ ...inputStyle, width: '100%', height: 20, marginTop: 2 }}
          />
        )}
      </div>

      <div style={{ ...profitStyle, width: LINE_ITEM_PROFIT_WIDTH }}>
        {lineType === 'normal' && (
          <>
            <span style={{ color: '#64748b' }}>利益</span>
            <strong style={{ color: summary.profit < 0 ? '#cf222e' : '#1f2937' }}>¥{formatNumber(Math.round(summary.profit))}</strong>
            <span>利益率 {summary.profitRate === null ? '—' : `${(summary.profitRate * 100).toFixed(1)}%`}</span>
            <span>粗利率 {summary.grossMarginRate === null ? '—' : `${(summary.grossMarginRate * 100).toFixed(1)}%`}</span>
            <span>日割粗利 {summary.dailyGrossProfit === null ? '—' : `¥${formatNumber(Math.round(summary.dailyGrossProfit))}/日`}</span>
          </>
        )}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  height: 20,
  padding: '0 6px',
  border: '1px solid #b6bdc6',
  borderRadius: 5,
  boxSizing: 'border-box',
  background: '#fff',
  fontSize: 12,
};

const joinedGroupStyle: React.CSSProperties = {
  display: 'flex',
  overflow: 'hidden',
  border: '1px solid #b6bdc6',
  borderRadius: 5,
  background: '#fff',
};

const joinedCellStyle: React.CSSProperties = {
  display: 'flex',
  borderLeft: '1px solid #d8dde3',
  marginLeft: -1,
};

const groupedInputStyle: React.CSSProperties = {
  height: 20,
  padding: '0 6px',
  border: 0,
  borderRadius: 0,
  boxSizing: 'border-box',
  background: '#fff',
  fontSize: 12,
};

const bandStyle: React.CSSProperties = {
  display: 'grid',
  alignItems: 'center',
  minHeight: 24,
  padding: '1px 0',
  boxSizing: 'border-box',
};

const bandLabelStyle: React.CSSProperties = {
  paddingLeft: 4,
  boxSizing: 'border-box',
  fontWeight: 700,
};

const resultStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  width: 330,
  paddingLeft: 4,
  whiteSpace: 'nowrap',
};

const mutedResultStyle: React.CSSProperties = { color: '#667085', fontSize: 11 };

const profitStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  width: 118,
  minHeight: 48,
  paddingLeft: 8,
  borderLeft: '1px solid #d0d7de',
  boxSizing: 'border-box',
  fontSize: 11,
  lineHeight: 1.35,
  whiteSpace: 'nowrap',
};

const selectorButtonStyle: React.CSSProperties = {
  width: 24,
  height: 20,
  padding: 0,
  border: '1px solid #b6bdc6',
  borderRadius: 5,
  background: '#f8fafc',
  cursor: 'pointer',
};

const ledgerButtonStyle: React.CSSProperties = {
  ...selectorButtonStyle,
  width: 'auto',
  padding: '0 6px',
  whiteSpace: 'nowrap',
  borderRadius: '5px 0 0 5px',
};
const ledgerArrowStyle: React.CSSProperties = {
  ...selectorButtonStyle,
  width: 20,
  borderLeft: 0,
  borderRadius: '0 5px 5px 0',
  fontSize: 9,
};
const ledgerMenuStyle: React.CSSProperties = {
  position: 'absolute',
  top: 23,
  right: 0,
  zIndex: 20,
  display: 'flex',
  flexDirection: 'column',
  gap: 1,
  minWidth: 130,
  padding: 4,
  background: '#fff',
  border: '1px solid #cbd5e1',
  borderRadius: 6,
  boxShadow: '0 5px 15px rgba(0,0,0,.15)',
};

const memoButtonStyle: React.CSSProperties = {
  height: 20,
  padding: '0 4px',
  border: 0,
  background: 'transparent',
  color: '#475569',
  fontSize: 11,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};
