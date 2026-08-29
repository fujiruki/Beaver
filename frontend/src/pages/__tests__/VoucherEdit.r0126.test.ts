import { describe, expect, it } from 'vitest';
import { getVoucherEditBlockReason } from '../VoucherEdit';

describe('VoucherEdit R-0126 編集可否', () => {
  it('売上へ引用済みの見積は編集不可理由を返す', () => {
    expect(getVoucherEditBlockReason({
      voucher_type: 'estimate',
      status: 'draft',
      converted_sales: [{ id: 2, voucher_no: 'S-0002', status: 'draft', voucher_date: '2026-01-01', quoted_at: null }],
    })).toBe('売上に引用済み');
  });

  it('請求済み・無効化済みの既存理由を維持する', () => {
    expect(getVoucherEditBlockReason({ voucher_type: 'sales', status: 'billed', converted_sales: [] })).toBe('請求済み');
    expect(getVoucherEditBlockReason({ voucher_type: 'estimate', status: 'void', converted_sales: [{ id: 2, voucher_no: 'S-0002', status: 'draft', voucher_date: '2026-01-01', quoted_at: null }] })).toBe('無効化済み');
  });
});
