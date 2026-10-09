import { describe, expect, it } from 'vitest';
import { getVoucherVoidBlockReason } from '../voucherVoid';

const sale = (status: 'draft' | 'void') => ({ id: 2, voucher_no: 'S-0002', status, voucher_date: '2026-01-01', quoted_at: null });

describe('R-0154 追加仕様2: 取消できない理由', () => {
  it('Accessで請求済み', () => {
    expect(getVoucherVoidBlockReason({ voucher_type: 'sales', status: 'approved', access_billed_flag: 1 }))
      .toBe('Accessで請求済みのため取消できません');
  });

  it('請求済み', () => {
    expect(getVoucherVoidBlockReason({ voucher_type: 'sales', status: 'billed', access_billed_flag: 0 }))
      .toBe('請求済みのため取消できません');
  });

  it('voidでない売上に引用済みの見積（詳細の converted_sales）', () => {
    expect(getVoucherVoidBlockReason({ voucher_type: 'estimate', status: 'draft', converted_sales: [sale('void'), sale('draft')] }))
      .toBe('売上に引用済みのため取消できません');
  });

  it('voidでない売上に引用済みの見積（一覧の quoted_by_sales）', () => {
    expect(getVoucherVoidBlockReason({ voucher_type: 'estimate', status: 'draft', quoted_by_sales: 1 }))
      .toBe('売上に引用済みのため取消できません');
  });

  it('取消できる伝票は null', () => {
    expect(getVoucherVoidBlockReason({ voucher_type: 'sales', status: 'draft', access_billed_flag: 0 })).toBeNull();
    expect(getVoucherVoidBlockReason({ voucher_type: 'estimate', status: 'approved', quoted_by_sales: 0 })).toBeNull();
    expect(getVoucherVoidBlockReason({ voucher_type: 'estimate', status: 'draft', converted_sales: [sale('void')] })).toBeNull();
  });
});
