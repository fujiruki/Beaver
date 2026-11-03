export const PAYMENT_TYPES = [
  '現金売上',
  '伊予銀行　長浜支店　宗三',
  '愛媛たいき農協　大和支所',
  '小切手',
  'その他',
  '値引き',
  '伊予銀行　長浜支店　藤田建具店',
] as const;

export const DEFAULT_PAYMENT_TYPE = '伊予銀行　長浜支店　藤田建具店';

/** 一覧に無い既存の値は選択肢の先頭に足して消さない */
export function paymentTypeOptions(current?: string | null): string[] {
  const list: string[] = [...PAYMENT_TYPES];
  return current && !list.includes(current) ? [current, ...list] : list;
}
