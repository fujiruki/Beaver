export interface Invoice {
  id: number;
  invoice_no: string;
  customer_id: number;
  customer_name?: string;
  invoice_date: string;
  cutoff_date: string;
  billing_date: string;
  carry_forward: number;
  sales_total: number;
  tax_total: number;
  payment_received: number;
  invoice_total: number;
  next_carry_forward: number;
  billing_name_print: string;
  created_at: string;
  updated_at: string;
  // R-0143 A-B-04でmigration追加予定。未適用の環境ではキー自体が存在しない
  access_cancelled_at?: string | null;
  // 詳細取得時のみ
  vouchers?: InvoiceVoucher[];
  payments?: Payment[];
}

export interface InvoiceVoucher {
  id: number;
  voucher_no: string;
  voucher_date: string;
  total_amount: number;
  memo: string | null;
}

export interface Payment {
  id: number;
  payment_no: string;
  customer_id: number;
  invoice_id: number | null;
  payment_date: string;
  amount: number;
  payment_type: string;
  memo: string | null;
  created_at: string;
  updated_at: string;
  customer_name?: string;
}

export type InvoiceInput = {
  customer_id: number;
  invoice_date: string;
  cutoff_date: string;
  billing_date: string;
  carry_forward: number;
  sales_total: number;
  tax_total: number;
  payment_received: number;
  invoice_total: number;
  next_carry_forward: number;
  voucher_ids: number[];
};

export type PaymentInput = {
  customer_id: number;
  invoice_id: number;
  payment_date: string;
  amount: number;
  payment_type: string;
  memo: string | null;
};
