export const round2 = (value: number) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

export const formatDecimal = (value: number | null | undefined) =>
  value == null || !Number.isFinite(Number(value))
    ? ''
    : round2(Number(value)).toLocaleString('ja-JP', { maximumFractionDigits: 2 });
