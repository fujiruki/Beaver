// R-0085: 設定画面からステータスの追加・編集ができるようになったため、固定ユニオン型ではなくstringにする
export type ProjectStatus = string;

export interface ProjectImage {
  id: number;
  project_id: number;
  file_name: string;
  file_path: string;
  display_order: number;
  created_at: string;
}

export interface ProjectVoucher {
  id: number;
  voucher_no: string;
  voucher_type: 'estimate' | 'sales';
  status: string;
  voucher_date: string;
  total_amount: number;
  description: string | null;
}

export interface Project {
  id: number;
  project_code: string | null;
  name: string;
  customer_id: number;
  customer_name?: string;
  description: string | null;
  address: string | null;
  status: ProjectStatus;
  start_date: string | null;
  end_date: string | null;
  delivery_date: string | null;
  memo: string | null;
  order_date: string | null;
  owner_name: string | null;
  general_contractor_name: string | null;
  site_contact: string | null;
  images?: ProjectImage[];
  vouchers?: ProjectVoucher[];
  estimated_factory_hours?: number;
  estimated_site_hours?: number;
  created_at: string;
  updated_at: string;
}

export type ProjectInput = {
  customer_id: number;
  name: string;
  description?: string | null;
  status: ProjectStatus;
  start_date?: string | null;
  end_date?: string | null;
  delivery_date?: string | null;
  address?: string | null;
  memo?: string | null;
  order_date?: string | null;
  owner_name?: string | null;
  general_contractor_name?: string | null;
  site_contact?: string | null;
};
