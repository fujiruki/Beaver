import { describe, expect, it } from 'vitest';
import { formatDecimal, round2 } from '../decimal';

describe('R-0254 小数第2位の丸めと表示', () => {
  it('round2 は小数第2位に四捨五入する', () => {
    expect(round2(1.234)).toBe(1.23);
    expect(round2(1.235)).toBe(1.24);
    expect(round2(4.7000000029802)).toBe(4.7);
    expect(round2(0)).toBe(0);
  });

  it('formatDecimal は第2位まで出し、末尾の0を省く', () => {
    expect(formatDecimal(4.7000000029802)).toBe('4.7');
    expect(formatDecimal(4.75)).toBe('4.75');
    expect(formatDecimal(4)).toBe('4');
    expect(formatDecimal(0.2)).toBe('0.2');
    expect(formatDecimal(1234.5)).toBe('1,234.5');
  });

  it('数でない値は空にする', () => {
    expect(formatDecimal(undefined)).toBe('');
    expect(formatDecimal(NaN)).toBe('');
  });
});
