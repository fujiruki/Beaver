export const SCHEDULE_KINDS = ['現調', '見積', '見積依頼', '打合せ', '材料発注', '外注依頼', '製作', '取付', 'その他'] as const;

export type ScheduleKind = typeof SCHEDULE_KINDS[number];

export const FIXED_SCHEDULE_KINDS: readonly ScheduleKind[] = ['現調', '見積', '製作', '取付'];

export interface ProjectSchedule {
  id: number;
  project_id: number;
  kind: ScheduleKind;
  start_date: string | null;
  end_date: string | null;
  hours: number | null;
  memo: string;
  done: number;
  created_at: string;
  updated_at: string;
}

export interface ProjectScheduleInput {
  kind: ScheduleKind;
  start_date?: string | null;
  end_date?: string | null;
  hours?: number | null;
  memo?: string;
  done?: number;
}
