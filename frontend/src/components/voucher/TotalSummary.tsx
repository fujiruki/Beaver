import { useTotalCalc } from '../../hooks/useTaxCalc';
import { calcProfitSummaryDynamic, type LineForCalc, type DynamicCostLine } from '../../lib/voucherCalc';
import { useAppSettings } from '../../contexts/AppSettingsContext';
import type { TaxInputType } from '../../types/voucher';

type Props = {
  lines: LineForCalc[];
  taxInputType: TaxInputType;
  taxRate: number;
  costLines?: DynamicCostLine[];
};

export default function TotalSummary({ lines, taxInputType, taxRate, costLines }: Props) {
  const { subtotal_taxable, tax_amount, total } = useTotalCalc(lines, taxInputType, taxRate);
  const { settings } = useAppSettings();
  const profit = costLines
    ? calcProfitSummaryDynamic(costLines, total - tax_amount, settings.hoursPerDay)
    : null;

  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
      <div style={containerStyle}>
        <Row label={taxInputType === 'exclusive' ? '課税対象額（税抜）' : '課税対象額（税抜換算）'}
          value={subtotal_taxable} />
        <Row label={`消費税（${Math.round(taxRate * 100)}%）`} value={tax_amount} />
        <Row label="合計" value={total} bold />
      </div>
      {profit && (
        <div style={containerStyle}>
          <Row label="利益小計" value={Math.round(profit.grossProfit)} colored={profit.grossProfit >= 0} />
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0',
            borderTop: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: 13, color: '#64748b' }}>利益率</span>
            <span style={{ fontSize: 14, color: profit.grossProfitRate !== null && profit.grossProfitRate >= 0.3 ? '#16a34a' : profit.grossProfitRate !== null && profit.grossProfitRate >= 0.2 ? '#d97706' : '#dc2626', fontWeight: 'bold' }}>
              {profit.grossProfitRate !== null ? `${(profit.grossProfitRate * 100).toFixed(1)}%` : '—'}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0',
            borderTop: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: 13, color: '#64748b' }}>粗利率</span>
            <span style={{ fontSize: 14, color: '#475569' }}>
              {profit.grossMarginRate !== null ? `${(profit.grossMarginRate * 100).toFixed(1)}%` : '—'}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0',
            borderTop: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: 13, color: '#64748b' }}>作業時間合計</span>
            <span style={{ fontSize: 14, color: '#475569' }}>
              {profit.totalWorkHours.toFixed(1)} h
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0',
            borderTop: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: 13, color: '#64748b' }}>日割り粗利</span>
            <span style={{ fontSize: 14, color: '#475569' }}>
              ¥{Math.round(profit.dailyGrossProfit).toLocaleString()}/日
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, bold, colored }: { label: string; value: number; bold?: boolean; colored?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0',
      borderTop: '1px solid #e2e8f0', fontWeight: bold ? 'bold' : 'normal' }}>
      <span style={{ fontSize: 13, color: bold ? '#1e293b' : '#64748b' }}>{label}</span>
      <span style={{ fontSize: bold ? 16 : 14, color: colored !== undefined ? (colored ? '#16a34a' : '#dc2626') : (bold ? '#1e293b' : '#475569') }}>
        ¥{value.toLocaleString()}
      </span>
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  background: '#f8fafc',
  border: '1px solid #e2e8f0',
  borderRadius: 8,
  padding: '12px 16px',
  minWidth: 280,
};

export function TopSummary({ lines, taxInputType, taxRate, costLines }: Props) {
  const { tax_amount, total } = useTotalCalc(lines, taxInputType, taxRate);
  const { settings } = useAppSettings();
  const sales = total - tax_amount;
  const profit = calcProfitSummaryDynamic(costLines ?? [], sales, settings.hoursPerDay);
  const normal = (costLines ?? []).filter(l => l.line_type === 'normal');
  const hoursOf = (code: string) => normal.reduce((sum, l) =>
    sum + l.costs.filter(c => c.category_code === code).reduce((s, c) => s + (c.value || 0), 0) * l.quantity, 0);
  const material = new Map<string, number>();
  for (const l of normal) {
    for (const c of l.costs) {
      if (c.measure_type !== 'money' || !c.value) continue;
      material.set(c.category_name, (material.get(c.category_name) ?? 0) + c.value * l.quantity);
    }
  }
  const rate = profit.grossProfitRate;

  return (
    <div data-testid="top-summary" style={containerStyle}>
      <Row label="売上" value={sales} bold />
      <Row label="原価" value={Math.round(sales - profit.grossProfit)} bold />
      <Row label="利益" value={Math.round(profit.grossProfit)} bold colored={profit.grossProfit >= 0} />
      <HoursRow label="工場時間" hours={hoursOf('FACTORY_TIME')} />
      <HoursRow label="現場時間" hours={hoursOf('SITE_TIME')} />
      <HoursRow label="合計時間" hours={profit.totalWorkHours} />
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: '1px solid #e2e8f0' }}>
        <span style={{ fontSize: 13, color: '#64748b' }}>利益率</span>
        <span style={{ fontSize: 14, color: '#475569' }}>{rate !== null ? `${(rate * 100).toFixed(1)}%` : '—'}</span>
      </div>
      {material.size > 0 && (
        <div data-testid="top-summary-material" style={{ padding: '6px 0', borderTop: '1px solid #e2e8f0', fontSize: 13, color: '#64748b' }}>
          材料原価　{[...material].map(([name, value]) => `${name} ¥${Math.round(value).toLocaleString()}`).join('　')}
        </div>
      )}
    </div>
  );
}

function HoursRow({ label, hours }: { label: string; hours: number }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0',
      borderTop: '1px solid #e2e8f0', fontWeight: 'bold' }}>
      <span style={{ fontSize: 13, color: '#1e293b' }}>{label}</span>
      <span style={{ fontSize: 16, color: '#1e293b' }}>{hours.toFixed(1)} h</span>
    </div>
  );
}
