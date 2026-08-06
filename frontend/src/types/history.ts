export type HistoryEntity = 'customers' | 'payments' | 'invoices';
export type HistoryAction = 'update' | 'delete' | 'restore';

export interface HistoryEnvelope {
  row: Record<string, unknown>;
  related: Record<string, unknown>;
}

export interface HistoryRecord {
  id: number;
  entity: HistoryEntity;
  entity_id: number;
  action: HistoryAction;
  before_json: string;
  after_json: string | null;
  clamped: number;
  changed_by: number | null;
  changed_by_name: string | null;
  created_at: string;
}
