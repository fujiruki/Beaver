import type { TaxInputType, LineCategoryValue } from '../types/voucher';

export type CostFields = {
  cost_body: number;
  cost_hardware: number;
  cost_glass: number;
  cost_factory_hours: number;
  cost_site_hours: number;
  cost_labor_rate: number;
};

export type LineForCalc = {
  line_type: 'normal' | 'discount' | 'subtotal';
  line_total: number;
  tax_category: string;
};

export type TotalResult = {
  subtotal_taxable: number;
  tax_amount: number;
  total: number;
};

export type PriceResult = {
  line_total: number;
};

/** 金額を100円単位で四捨五入する */
export function roundToHundred(value: number): number {
  return Math.round(value / 100) * 100;
}

/** 製造原価（固定列版・後方互換） */
export function calcManufactureCost(line: CostFields): number {
  const body = line.cost_body || 0;
  const hardware = line.cost_hardware || 0;
  const glass = line.cost_glass || 0;
  const factoryHours = line.cost_factory_hours || 0;
  const siteHours = line.cost_site_hours || 0;
  const laborRate = line.cost_labor_rate || 0;
  return body + hardware + glass + (factoryHours + siteHours) * laborRate;
}

/** 材料原価（動的版） */
export function calcMaterialCostDynamic(costs: LineCategoryValue[], quantity: number): number {
  return costs
    .filter(c => c.measure_type === 'money')
    .reduce((s, c) => s + (c.value || 0), 0) * quantity;
}

/** 労務費（動的版） */
export function calcLaborCostDynamic(costs: LineCategoryValue[], laborRate: number, quantity: number): number {
  return costs
    .filter(c => c.measure_type === 'time')
    .reduce((s, c) => s + (c.value || 0), 0) * laborRate * quantity;
}

/** 製造原価（動的版） */
export function calcManufactureCostDynamic(
  costs: LineCategoryValue[],
  laborRate: number,
  quantity: number,
): number {
  return calcMaterialCostDynamic(costs, quantity) + calcLaborCostDynamic(costs, laborRate, quantity);
}

/** 売値合計（動的版） */
export function calcLineTotalDynamic(prices: LineCategoryValue[], quantity: number): number {
  return prices.reduce((s, c) => s + (c.value || 0), 0) * quantity;
}

/** 伝票合計計算（税込/税抜対応） */
export function calcVoucherTotal(
  lines: LineForCalc[],
  taxInputType: TaxInputType,
  taxRate: number,
): TotalResult {
  const normalLines = lines.filter(l => l.line_type === 'normal');
  const discountLines = lines.filter(l => l.line_type === 'discount');
  const discountAmount = discountLines.reduce((sum, l) => sum + (l.line_total || 0), 0);

  if (taxInputType === 'exclusive') {
    const taxable = normalLines
      .filter(l => l.tax_category === 'taxable')
      .reduce((sum, l) => sum + (l.line_total || 0), 0);
    const nonTaxable = normalLines
      .filter(l => l.tax_category !== 'taxable')
      .reduce((sum, l) => sum + (l.line_total || 0), 0);
    const taxAmount = Math.floor(taxable * taxRate);
    return {
      subtotal_taxable: taxable,
      tax_amount: taxAmount,
      total: taxable + taxAmount + nonTaxable - discountAmount,
    };
  } else {
    const taxableInclusive = normalLines
      .filter(l => l.tax_category === 'taxable')
      .reduce((sum, l) => sum + (l.line_total || 0), 0);
    const nonTaxable = normalLines
      .filter(l => l.tax_category !== 'taxable')
      .reduce((sum, l) => sum + (l.line_total || 0), 0);
    const taxAmount = Math.floor(taxableInclusive * taxRate / (1 + taxRate));
    const taxableExclusive = taxableInclusive - taxAmount;
    return {
      subtotal_taxable: taxableExclusive,
      tax_amount: taxAmount,
      total: taxableInclusive + nonTaxable - discountAmount,
    };
  }
}

export type CostLineForCalc = {
  cost_body: number;
  cost_hardware: number;
  cost_glass: number;
  cost_factory_hours: number;
  cost_site_hours: number;
  cost_labor_rate: number;
  quantity: number;
  line_type: 'normal' | 'discount' | 'subtotal';
  line_total: number;
};

export type DynamicCostLine = {
  costs: LineCategoryValue[];
  cost_labor_rate: number;
  quantity: number;
  line_type: 'normal' | 'discount' | 'subtotal';
  line_total: number;
};

export type ProfitSummary = {
  grossProfit: number;
  grossProfitRate: number;
  grossMarginRate: number;
  totalWorkHours: number;
  profitPerHour: number | null;
};

export function calcProfitSummary(lines: CostLineForCalc[], voucherTotal: number): ProfitSummary {
  const normalLines = lines.filter(l => l.line_type === 'normal');
  let grossProfit = 0;
  let materialCost = 0;
  let totalWorkHours = 0;
  for (const l of normalLines) {
    const mat = (l.cost_body + l.cost_hardware + l.cost_glass) * l.quantity;
    const labor = (l.cost_factory_hours + l.cost_site_hours) * l.cost_labor_rate * l.quantity;
    const mfgCost = mat + labor;
    grossProfit += l.line_total - mfgCost;
    materialCost += mat;
    totalWorkHours += (l.cost_factory_hours + l.cost_site_hours) * l.quantity;
  }
  const totalSales = normalLines.reduce((s, l) => s + l.line_total, 0);
  const grossProfitRate = voucherTotal > 0 ? grossProfit / voucherTotal : 0;
  const grossMarginRate = totalSales > 0 ? (totalSales - materialCost) / totalSales : 0;
  const profitPerHour = totalWorkHours > 0 ? grossProfit / totalWorkHours : null;
  return { grossProfit, grossProfitRate, grossMarginRate, totalWorkHours, profitPerHour };
}

export function calcProfitSummaryDynamic(lines: DynamicCostLine[], voucherTotal: number): ProfitSummary {
  const normalLines = lines.filter(l => l.line_type === 'normal');
  let grossProfit = 0;
  let materialCost = 0;
  let totalWorkHours = 0;
  for (const l of normalLines) {
    const mat = calcMaterialCostDynamic(l.costs, l.quantity);
    const labor = calcLaborCostDynamic(l.costs, l.cost_labor_rate, l.quantity);
    const mfgCost = mat + labor;
    grossProfit += l.line_total - mfgCost;
    materialCost += mat;
    totalWorkHours += l.costs
      .filter(c => c.measure_type === 'time')
      .reduce((s, c) => s + (c.value || 0), 0) * l.quantity;
  }
  const totalSales = normalLines.reduce((s, l) => s + l.line_total, 0);
  const grossProfitRate = voucherTotal > 0 ? grossProfit / voucherTotal : 0;
  const grossMarginRate = totalSales > 0 ? (totalSales - materialCost) / totalSales : 0;
  const profitPerHour = totalWorkHours > 0 ? grossProfit / totalWorkHours : null;
  return { grossProfit, grossProfitRate, grossMarginRate, totalWorkHours, profitPerHour };
}

/**
 * 利益率から売値を計算（1行単位）
 * sell_price = ceil(cost / (1 - profitRate))
 */
export function calcPriceFromProfit(line: CostFields, profitRate: number): PriceResult {
  const cost = calcManufactureCost(line);
  if (cost === 0) return { line_total: 0 };
  if (profitRate <= 0) return { line_total: cost };
  if (profitRate >= 1) return { line_total: cost };
  return { line_total: Math.ceil(cost / (1 - profitRate)) };
}
