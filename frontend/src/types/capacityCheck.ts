// R-0118: Youkan容量判定（Y1契約レスポンス + Beaver縮退ラッパー）

export interface CapacityCheckResult {
  external_project_id: number;
  feasible: boolean;
  /** 判定に使った締切。nullなら納期未設定 */
  deadline: string | null;
  required_minutes: number;
  placed_minutes: number;
  unplaced_minutes: number;
  shortage_minutes: number;
  earliest_completion_date: string | null;
  saturated_through: string | null;
  /** 結論優先の日本語1行。そのまま表示してよい */
  message: string;
  evaluated_at: string;
}

export type CapacityCheckReason = 'unreachable' | 'excluded_status' | 'not_found' | 'config';

export type CapacityCheckResponse =
  | { ok: true; result: CapacityCheckResult }
  | { ok: false; reason: CapacityCheckReason; message: string };
