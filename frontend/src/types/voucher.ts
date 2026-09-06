export type VoucherType   = 'estimate' | 'sales';
export type VoucherStatus = 'draft' | 'submitted' | 'approved' | 'void' | 'billed';
export type TaxInputType  = 'exclusive' | 'inclusive';

export interface LineCategoryValue {
  id?: number;
  voucher_line_id?: number;
  category_code: string;
  category_name: string;
  measure_type: 'money' | 'time';
  value: number;
  sort_order: number;
}

/** 見積から引用された売上の簡易情報（双方向トレース用） */
export interface ConvertedSalesSummary {
  id: number;
  voucher_no: string;
  status: VoucherStatus;
  voucher_date: string;
  quoted_at: string | null;
}

export interface Voucher {
  id: number;
  voucher_no: string;
  voucher_type: VoucherType;
  status: VoucherStatus;
  project_id: number | null;
  customer_id: number;
  voucher_date: string;
  delivery_date: string | null;
  tax_input_type: TaxInputType;
  consumption_tax_type: string;
  override_billing_date: string | null;
  profit_rate: number;
  description: string | null;
  memo: string | null;
  validity_period?: string | null;
  /** 引用元の見積伝票ID（売上伝票のみ） */
  source_voucher_id?: number | null;
  /** 引用元の見積伝票番号（売上伝票のみ） */
  source_estimate_no?: string | null;
  /** 引用日（売上伝票のみ） */
  quoted_at?: string | null;
  subtotal_taxable: number;
  tax_amount: number;
  total_amount: number;
  lines: VoucherLine[];
  // JOINされる
  customer_name?: string;
  project_name?: string;
  /** 引用先売上の一覧（見積伝票のみ、詳細取得時に付加） */
  converted_sales?: ConvertedSalesSummary[];
  // R-0143 A-B-06: AccessTategu連携の同期状態
  /** Access採番の伝票ID。非nullなら「Access由来」、nullなら「Beaver作成」 */
  access_voucher_id?: number | null;
  /** Accessで請求済みか（1=請求済み・編集不可） */
  access_billed_flag?: number;
  /** Accessでの請求日（access_billed_flag=1のとき） */
  access_billing_date?: string | null;
  /** サーバでの最終同期時刻 */
  last_synced_at?: string | null;
  /** Access側で確認待ち（競合の可能性あり）の印 */
  sync_pending?: number;
}

export interface VoucherLine {
  id: number;
  voucher_id: number;
  line_no: number;
  line_type: 'normal' | 'discount' | 'subtotal';
  location_no: number | null;
  location_name: string | null;
  tategu_item_id: number | null;
  source_catalog_item_id: number | null;
  item_name: string | null;
  quantity: number;
  // 原価（固定列・後方互換）
  cost_body: number;
  cost_hardware: number;
  cost_glass: number;
  cost_factory_hours: number;
  cost_site_hours: number;
  cost_labor_rate: number;
  snapshot_loaded_at: string | null;
  // 売価（固定列・後方互換）
  price_body: number;
  price_hardware: number;
  price_glass: number;
  line_total: number;
  tax_category: string;
  memo: string | null;
  // 動的集計区分
  costs: LineCategoryValue[];
  prices: LineCategoryValue[];
}

export type VoucherInput = Omit<Voucher, 'id' | 'voucher_no' | 'lines' | 'subtotal_taxable' | 'tax_amount' | 'total_amount' | 'customer_name' | 'project_name'>;
