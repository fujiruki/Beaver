import type { HistoryEntity } from '../../types/history';

/** カラム名 → 日本語ラベル対応表（エンティティ別）。差分表示・現在値プレビューで共通利用する */
export const HISTORY_LABELS: Record<HistoryEntity, Record<string, string>> = {
  customers: {
    name: '得意先名',
    name_kana: 'フリガナ',
    honorific_type: '敬称',
    gender: '性別',
    postal_code: '郵便番号',
    address1: '住所1',
    address2: '住所2',
    tel: '電話番号',
    mobile: '携帯電話',
    fax: 'FAX',
    email: 'メール',
    memo: '備考',
    billing_name: '請求書宛名',
    billing_date_print: '請求日印字',
    cutoff_day: '締め日',
    billing_offset_days: '請求日オフセット',
    payment_due_days: '支払期限日数',
    is_active: '有効フラグ',
  },
  payments: {
    payment_no: '入金番号',
    payment_date: '入金日',
    amount: '金額',
    payment_type: '入金種別',
    memo: '備考',
  },
  invoices: {
    invoice_no: '請求番号',
    invoice_date: '発行日',
    cutoff_date: '締め日',
    billing_date: '請求日',
    carry_forward: '前月繰越',
    sales_total: '売上合計',
    tax_total: '消費税',
    payment_received: '入金額',
    invoice_total: '請求合計',
    next_carry_forward: '次月繰越',
  },
};

/** 削除/復元の履歴表示で見出しとして使う主要フィールド（表示順） */
export const HISTORY_SUMMARY_FIELDS: Record<HistoryEntity, string[]> = {
  customers: ['name', 'tel'],
  payments: ['payment_no', 'payment_date', 'amount', 'payment_type'],
  invoices: ['invoice_no', 'billing_date', 'invoice_total', 'next_carry_forward'],
};

const AMOUNT_FIELDS = new Set(['amount', 'carry_forward', 'sales_total', 'tax_total',
  'payment_received', 'invoice_total', 'next_carry_forward']);

export function formatHistoryValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '(未設定)';
  if (AMOUNT_FIELDS.has(field) && typeof value === 'number') return `¥${value.toLocaleString()}`;
  if (field === 'is_active' || field === 'billing_date_print') return value === 1 || value === '1' ? 'あり' : 'なし';
  return String(value);
}
