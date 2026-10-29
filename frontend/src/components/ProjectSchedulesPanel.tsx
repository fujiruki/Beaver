import { useState } from 'react';
import {
  useProjectSchedules,
  useCreateProjectSchedule,
  useUpdateProjectSchedule,
  useDeleteProjectSchedule,
} from '../api/projectSchedules';
import { SCHEDULE_KINDS } from '../types/projectSchedule';
import type { ProjectSchedule, ScheduleKind } from '../types/projectSchedule';

const inputCls =
  'w-full border border-slate-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

interface BlankDraft {
  kind: ScheduleKind | '';
  start_date: string;
  end_date: string;
  memo: string;
}

const EMPTY_DRAFT: BlankDraft = { kind: '', start_date: '', end_date: '', memo: '' };

export default function ProjectSchedulesPanel({ projectId }: { projectId: number }) {
  const { data } = useProjectSchedules(projectId);
  const schedules = Array.isArray(data) ? data : [];
  const createMutation = useCreateProjectSchedule(projectId);
  const updateMutation = useUpdateProjectSchedule();
  const deleteMutation = useDeleteProjectSchedule();
  const [draft, setDraft] = useState<BlankDraft>(EMPTY_DRAFT);

  function updateDraft(patch: Partial<BlankDraft>) {
    const next = { ...draft, ...patch };
    if (!next.end_date) {
      setDraft(next);
      return;
    }
    setDraft(EMPTY_DRAFT);
    createMutation.mutate({
      kind: next.kind || '見積',
      start_date: next.start_date || null,
      end_date: next.end_date,
      memo: next.memo,
    });
  }

  function update(schedule: ProjectSchedule, patch: Partial<ProjectSchedule>) {
    updateMutation.mutate({ id: schedule.id, ...patch });
  }

  return (
    <div className="bg-white rounded-lg shadow-sm p-5">
      <h2 className="text-sm font-bold text-slate-600 border-b border-slate-100 pb-2 mb-3">予定</h2>
      <p className="text-xs text-slate-400 mb-2">製作: 開始日・工数は上の欄</p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-slate-400 border-b">
            <th className="text-left pb-1 w-32">種類</th>
            <th className="text-left pb-1 w-40">開始</th>
            <th className="text-left pb-1 w-40">終了/期限</th>
            <th className="text-left pb-1">メモ</th>
            <th className="text-center pb-1 w-12">済</th>
            <th className="w-12" />
          </tr>
        </thead>
        <tbody>
          {schedules.map(s => (
            <tr key={`${s.id}-${s.updated_at}`} className="border-b border-slate-100">
              <td className="py-1 pr-2">
                <select
                  aria-label="予定の種類"
                  defaultValue={s.kind}
                  onChange={e => update(s, { kind: e.target.value as ScheduleKind })}
                  className={inputCls}
                >
                  {SCHEDULE_KINDS.map(k => <option key={k} value={k}>{k}</option>)}
                </select>
              </td>
              <td className="py-1 pr-2">
                <input
                  type="date"
                  aria-label="予定の開始"
                  defaultValue={s.start_date ?? ''}
                  onBlur={e => e.target.value !== (s.start_date ?? '') && update(s, { start_date: e.target.value || null })}
                  className={inputCls}
                />
              </td>
              <td className="py-1 pr-2">
                <input
                  type="date"
                  aria-label="予定の終了または期限"
                  defaultValue={s.end_date}
                  onBlur={e => e.target.value && e.target.value !== s.end_date && update(s, { end_date: e.target.value })}
                  className={inputCls}
                />
              </td>
              <td className="py-1 pr-2">
                <input
                  aria-label="予定のメモ"
                  defaultValue={s.memo}
                  onBlur={e => e.target.value !== s.memo && update(s, { memo: e.target.value })}
                  className={inputCls}
                />
              </td>
              <td className="py-1 text-center">
                <input
                  type="checkbox"
                  aria-label="予定が済"
                  checked={!!s.done}
                  onChange={e => update(s, { done: e.target.checked ? 1 : 0 })}
                />
              </td>
              <td>
                <button type="button" onClick={() => deleteMutation.mutate(s.id)} className="text-xs text-red-500">
                  削除
                </button>
              </td>
            </tr>
          ))}
          <tr>
            <td className="py-1 pr-2">
              <select
                aria-label="予定の種類"
                value={draft.kind}
                onChange={e => updateDraft({ kind: e.target.value as ScheduleKind })}
                className={inputCls}
              >
                <option value="">空行に入力すると追加</option>
                {SCHEDULE_KINDS.map(k => <option key={k} value={k}>{k}</option>)}
              </select>
            </td>
            <td className="py-1 pr-2">
              <input
                type="date"
                aria-label="予定の開始"
                value={draft.start_date}
                onChange={e => setDraft({ ...draft, start_date: e.target.value })}
                className={inputCls}
              />
            </td>
            <td className="py-1 pr-2">
              <input
                type="date"
                aria-label="予定の終了または期限"
                value={draft.end_date}
                onChange={e => updateDraft({ end_date: e.target.value })}
                className={inputCls}
              />
            </td>
            <td className="py-1 pr-2">
              <input
                aria-label="予定のメモ"
                value={draft.memo}
                onChange={e => setDraft({ ...draft, memo: e.target.value })}
                className={inputCls}
              />
            </td>
            <td />
            <td />
          </tr>
        </tbody>
      </table>
    </div>
  );
}
