export const SCHEDULE_KINDS = ['見積', '見積依頼', '現調', '打合せ', '材料発注', '外注依頼', '取付', 'その他'] as const;

export type ScheduleKind = typeof SCHEDULE_KINDS[number];

export interface ProjectSchedule {
  id: number;
  project_id: number;
  kind: ScheduleKind;
  start_date: string | null;
  end_date: string;
  memo: string;
  done: number;
  created_at: string;
  updated_at: string;
}

export interface ProjectScheduleInput {
  kind: ScheduleKind;
  start_date?: string | null;
  end_date: string;
  memo?: string;
  done?: number;
}
