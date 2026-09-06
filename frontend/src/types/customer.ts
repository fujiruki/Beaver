export interface Customer {
  id: number;
  code: string | null;
  name: string;
  name_kana: string | null;
  honorific_type: string;
  gender: string | null;
  postal_code: string | null;
  address1: string | null;
  address2: string | null;
  tel: string | null;
  mobile: string | null;
  fax: string | null;
  email: string | null;
  memo: string | null;
  billing_name: string | null;
  billing_date_print: number;
  cutoff_day: number;
  billing_offset_days: number;
  payment_due_days: number;
  carry_forward_balance: number;
  is_active: number;
  created_at: string;
  updated_at: string;
  // R-0143 A-B-06: AccessTategu連携の同期状態
  /** Access採番の得意先コード。非nullなら「Access由来」、nullなら「Beaver作成」 */
  access_customer_no?: string | null;
}

// R-075: codeはサーバー側で自動採番するため、クライアントからは送信不可（型からも除外）
// R-0143 A-B-06: access_customer_noもAccess側が発行するため同様に除外
export type CustomerInput = Omit<Customer, 'id' | 'created_at' | 'updated_at' | 'carry_forward_balance' | 'code' | 'access_customer_no'>;
