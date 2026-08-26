import { useFormContext } from 'react-hook-form';
import { useVoucherStore } from '../../stores/voucherStore';
import { useAppSettings } from '../../contexts/AppSettingsContext';
import { calcManufactureCostDynamic, calcLaborCostDynamic } from '../../lib/voucherCalc';
import type { VoucherFormValues } from '../../pages/VoucherEdit';
import type { AggregationCategoryMaster } from '../../api/aggregationCategories';
import type { LineCategoryValue } from '../../types/voucher';

type Props = {
  categories: AggregationCategoryMaster[];
};

export default function ProfitRateBar({ categories }: Props) {
  const { profitRate, setProfitRate } = useVoucherStore();
  const { getValues, setValue } = useFormContext<VoucherFormValues>();
  const { settings } = useAppSettings();

  function applyProfitRate() {
    const lines = getValues('lines');
    lines.forEach((line, index) => {
      if (line.line_type !== 'normal') return;

      const costs: LineCategoryValue[] = line.costs ?? [];
      const laborRate = line.cost_labor_rate ?? 0;

      if (costs.length > 0) {
        // 動的モード: costs[] を元に各 money型区分の売値を計算
        const moneyCats = categories.filter(c => c.measure_type === 'money');
        const timeCats  = categories.filter(c => c.measure_type === 'time');

        const newPrices: LineCategoryValue[] = [];

        // money型原価 → 利益率で売値計算
        for (const cat of moneyCats) {
          const costVal = costs.find(c => c.category_code === cat.code)?.value ?? 0;
          if (costVal === 0) continue;
          const sellVal = profitRate >= 1 ? costVal : Math.ceil(costVal / (1 - profitRate));
          newPrices.push({
            category_code: cat.code,
            category_name: cat.name,
            measure_type: 'money',
            value: sellVal,
            sort_order: cat.sort_order,
          });
        }

        // time型原価 → 労務費を merge_into_price_code の区分に加算
        for (const cat of timeCats) {
          const hours = costs.find(c => c.category_code === cat.code)?.value ?? 0;
          if (hours === 0) continue;
          const laborAmt = hours * laborRate;
          const laborSell = profitRate >= 1 ? laborAmt : Math.ceil(laborAmt / (1 - profitRate));
          const mergeCode = (cat as any).merge_into_price_code as string | null;
          if (mergeCode) {
            const existing = newPrices.find(p => p.category_code === mergeCode);
            if (existing) {
              existing.value += laborSell;
            } else {
              const mergeCat = categories.find(c => c.code === mergeCode);
              if (mergeCat) {
                newPrices.push({
                  category_code: mergeCode,
                  category_name: mergeCat.name,
                  measure_type: 'money',
                  value: laborSell,
                  sort_order: mergeCat.sort_order,
                });
              }
            }
          }
        }

        if (newPrices.length > 0) {
          newPrices.sort((a, b) => a.sort_order - b.sort_order);
          setValue(`lines.${index}.prices`, newPrices);
          const unitPrice = newPrices.reduce((s, p) => s + p.value, 0);
          setValue(`lines.${index}.line_total`, unitPrice * (line.quantity ?? 1));
        }
      } else {
        // フォールバック: 固定列モード
        const mfgCost = calcManufactureCostDynamic(costs, laborRate, 1)
          || (line.cost_body ?? 0) + (line.cost_hardware ?? 0) + (line.cost_glass ?? 0)
            + calcLaborCostDynamic(
              [
                { category_code: 'FACTORY_TIME', category_name: '工場時間', measure_type: 'time', value: line.cost_factory_hours ?? 0, sort_order: 4 },
                { category_code: 'SITE_TIME',    category_name: '現場時間', measure_type: 'time', value: line.cost_site_hours    ?? 0, sort_order: 5 },
              ],
              laborRate,
              1,
            );
        if (mfgCost === 0) return;
        const lineTotal = profitRate >= 1 ? mfgCost : Math.ceil(mfgCost / (1 - profitRate));
        setValue(`lines.${index}.line_total`, lineTotal);
        setValue(`lines.${index}.price_body`, lineTotal);
        setValue(`lines.${index}.price_hardware`, 0);
        setValue(`lines.${index}.price_glass`, 0);
      }
    });
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
      background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, marginBottom: 12 }}>
      <span style={{ fontSize: 13, color: '#475569', fontWeight: 'bold' }}>利益率：</span>
      <div style={{ display: 'flex', gap: 4 }}>
        {settings.profitRatePresets.map(rate => (
          <button
            key={rate}
            type="button"
            onClick={() => setProfitRate(rate)}
            style={{
              padding: '4px 10px', borderRadius: 4, fontSize: 13, cursor: 'pointer',
              border: '1px solid',
              background: profitRate === rate ? '#2563eb' : '#f8fafc',
              color: profitRate === rate ? '#fff' : '#475569',
              borderColor: profitRate === rate ? '#2563eb' : '#cbd5e1',
            }}>
            {Math.round(rate * 100)}%
          </button>
        ))}
      </div>
      <button type="button" onClick={applyProfitRate} style={applyBtnStyle}>
        原価から売値を設定
      </button>
    </div>
  );
}

const applyBtnStyle: React.CSSProperties = {
  padding: '6px 14px', background: '#0f766e', color: '#fff', border: 'none',
  borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 'bold',
};
