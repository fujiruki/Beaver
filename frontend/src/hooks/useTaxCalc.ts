import { useMemo } from 'react';
import { calcVoucherTotal, type LineForCalc, type TotalResult } from '../lib/voucherCalc';
import type { TaxInputType } from '../types/voucher';

export function useTotalCalc(
  lines: LineForCalc[],
  taxInputType: TaxInputType,
  taxRate: number,
): TotalResult {
  return useMemo(
    () => calcVoucherTotal(lines, taxInputType, taxRate),
    [lines, taxInputType, taxRate],
  );
}
