import { useMemo } from 'react';
import {
  calcManufactureCost,
  calcManufactureCostDynamic,
  calcMaterialCostDynamic,
  calcLaborCostDynamic,
  type CostFields,
} from '../lib/voucherCalc';
import type { LineCategoryValue } from '../types/voucher';

export function useCostCalc(line: CostFields): { manufactureCost: number } {
  const manufactureCost = useMemo(() => calcManufactureCost(line), [
    line.cost_body,
    line.cost_hardware,
    line.cost_glass,
    line.cost_factory_hours,
    line.cost_site_hours,
    line.cost_labor_rate,
  ]);
  return { manufactureCost };
}

export function useCostCalcDynamic(
  costs: LineCategoryValue[],
  laborRate: number,
): { manufactureCost: number; materialCost: number; laborCost: number } {
  const costsKey = useMemo(() => JSON.stringify(costs), [costs]);
  const manufactureCost = useMemo(
    () => calcManufactureCostDynamic(costs, laborRate, 1),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [costsKey, laborRate],
  );
  const materialCost = useMemo(
    () => calcMaterialCostDynamic(costs, 1),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [costsKey],
  );
  const laborCost = useMemo(
    () => calcLaborCostDynamic(costs, laborRate, 1),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [costsKey, laborRate],
  );
  return { manufactureCost, materialCost, laborCost };
}
