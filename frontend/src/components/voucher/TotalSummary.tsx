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
  const profit = costLines ? calcProfitSummaryDynamic(costLines, total) : null;

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
            <span style={{ fontSize: 14, color: profit.grossProfitRate >= 0.3 ? '#16a34a' : profit.grossProfitRate >= 0.2 ? '#d97706' : '#dc2626', fontWeight: 'bold' }}>
              {(profit.grossProfitRate * 100).toFixed(1)}%
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0',
            borderTop: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: 13, color: '#64748b' }}>粗利率</span>
            <span style={{ fontSize: 14, color: '#475569' }}>
              {(profit.grossMarginRate * 100).toFixed(1)}%
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
              {profit.profitPerHour !== null
                ? `¥${Math.round(profit.profitPerHour * settings.hoursPerDay).toLocaleString()}/日`
                : '—'}
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
