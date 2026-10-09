import type { Voucher } from '../types/voucher';

type VoucherBlockState = Partial<Pick<Voucher,
  'voucher_type' | 'status' | 'converted_sales' | 'access_billed_flag' | 'quoted_by_sales'>>;

export function getVoucherEditBlockReason(voucher?: VoucherBlockState): string | null {
  // R-0143 A-B-06: Accessで請求済みの伝票はstatusに関わらず編集不可（バックエンドは既に409を返す）
  if (voucher?.access_billed_flag === 1) return 'Accessで請求済み';
  if (voucher?.status === 'billed') return '請求済み';
  if (voucher?.status === 'void') return '無効化済み';
  if (voucher?.voucher_type === 'estimate'
    && (voucher.quoted_by_sales === 1 || voucher.converted_sales?.some(s => s.status !== 'void'))) {
    return '売上に引用済み';
  }
  return null;
}

/** R-0154 追加仕様2: 取消ボタンを無効表示するときの理由（取消できるならnull）。voidの伝票はボタン自体を出さない */
export function getVoucherVoidBlockReason(voucher?: VoucherBlockState): string | null {
  const reason = getVoucherEditBlockReason(voucher);
  return reason && `${reason}のため取消できません`;
}
