import { useEffect, useRef, useState } from 'react';
import {
  useProjectSchedules,
  useCreateProjectSchedule,
  useUpdateProjectSchedule,
  useDeleteProjectSchedule,
} from '../api/projectSchedules';
import { SCHEDULE_KINDS, FIXED_SCHEDULE_KINDS } from '../types/projectSchedule';
import type { ProjectSchedule, ScheduleKind } from '../types/projectSchedule';
import { formatHours } from './dandori/dandoriBoardUtils';

const inputCls =
  'w-full border border-slate-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
const ghostInputCls = `${inputCls} text-slate-400`;
const hoursCls = `${inputCls} text-right`;

interface Draft {
  kind: ScheduleKind | '';
  start_date: string;
  end_date: string;
  hours: string;
  memo: string;
}

const EMPTY_DRAFT: Draft = { kind: '', start_date: '', end_date: '', hours: '', memo: '' };

function parseHours(value: string): number | null {
  const n = value === '' ? NaN : Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function hasContent(draft: Draft): boolean {
  return draft.start_date !== '' || draft.end_date !== '' || parseHours(draft.hours) !== null;
}

function orderSchedules(schedules: ProjectSchedule[]): ProjectSchedule[] {
  const fixed = FIXED_SCHEDULE_KINDS.flatMap(kind =>
    schedules.filter(schedule => schedule.kind === kind).sort((a, b) => a.id - b.id),
  );
  const others = schedules
    .filter(schedule => !FIXED_SCHEDULE_KINDS.includes(schedule.kind))
    .sort((a, b) => a.id - b.id);
  return [...fixed, ...others];
}

export default function ProjectSchedulesPanel({ projectId }: { projectId: number }) {
  const { data, isSuccess } = useProjectSchedules(projectId);
  const schedules = Array.isArray(data) ? data : [];
  const createMutation = useCreateProjectSchedule(projectId);
  const updateMutation = useUpdateProjectSchedule();
  const deleteMutation = useDeleteProjectSchedule();
  const [blank, setBlank] = useState<Draft>(EMPTY_DRAFT);
  const [blankKindRequired, setBlankKindRequired] = useState(false);
  const [fixedDrafts, setFixedDrafts] = useState<Partial<Record<ScheduleKind, Draft>>>({});
  const [visibleSchedules, setVisibleSchedules] = useState<ProjectSchedule[]>([]);
  const tableHasFocus = useRef(false);

  useEffect(() => {
    if (!tableHasFocus.current) setVisibleSchedules(schedules);
  }, [data]);

  const displayedSchedules = tableHasFocus.current ? visibleSchedules : schedules;
  const orderedSchedules = orderSchedules(displayedSchedules);

  function create(kind: ScheduleKind, draft: Draft) {
    createMutation.mutate({
      kind,
      start_date: draft.start_date || null,
      end_date: draft.end_date || null,
      hours: parseHours(draft.hours),
      memo: draft.memo,
    });
  }

  function changeFixed(kind: ScheduleKind, patch: Partial<Draft>) {
    const next = { ...(fixedDrafts[kind] ?? EMPTY_DRAFT), ...patch };
    setFixedDrafts(prev => ({ ...prev, [kind]: next }));
  }

  function changeBlank(patch: Partial<Draft>) {
    const next = { ...blank, ...patch };
    setBlank(next);
    if (next.kind) setBlankKindRequired(false);
  }

  function commitFixed(kind: ScheduleKind) {
    const draft = fixedDrafts[kind] ?? EMPTY_DRAFT;
    if (!hasContent(draft)) return;
    setFixedDrafts(prev => ({ ...prev, [kind]: EMPTY_DRAFT }));
    create(kind, draft);
  }

  function commitBlank() {
    if (!hasContent(blank)) return;
    if (!blank.kind) {
      setBlankKindRequired(true);
      return;
    }
    const kind = blank.kind;
    const draft = blank;
    setBlank(EMPTY_DRAFT);
    setBlankKindRequired(false);
    create(kind, draft);
  }

  function update(schedule: ProjectSchedule, patch: Partial<ProjectSchedule>) {
    updateMutation.mutate({ id: schedule.id, ...patch });
  }

  return (
    <div className="bg-white rounded-lg shadow-sm p-5">
      <h2 className="text-sm font-bold text-slate-600 border-b border-slate-100 pb-2 mb-3">予定</h2>
      <table className="w-full table-fixed text-sm">
        <thead>
          <tr className="text-xs text-slate-400 border-b">
            <th className="text-left pb-1 w-28">種類</th>
            <th className="text-left pb-1 w-36">開始</th>
            <th className="text-left pb-1 w-36">終了/期限</th>
            <th className="text-right pb-1 w-20">時間</th>
            <th className="text-left pb-1">メモ</th>
            <th className="text-center pb-1 w-10">済</th>
            <th className="w-10" />
          </tr>
        </thead>
        <tbody
          onFocus={() => { tableHasFocus.current = true; }}
          onBlur={event => {
            if (event.currentTarget.contains(event.relatedTarget)) return;
            tableHasFocus.current = false;
            setVisibleSchedules(schedules);
          }}
        >
          {FIXED_SCHEDULE_KINDS.flatMap(kind => {
            const saved = orderedSchedules.filter(schedule => schedule.kind === kind);
            if (saved.length > 0) return saved.map(schedule => renderScheduleRow(schedule));
            if (!isSuccess) return [];
            const draft = fixedDrafts[kind] ?? EMPTY_DRAFT;
            return [(
              <tr
                key={`fixed-${kind}`}
                data-testid="fixed-schedule-row"
                data-kind={kind}
                className="border-b border-slate-100 text-slate-400"
                onBlur={event => {
                  if (!event.currentTarget.contains(event.relatedTarget)) commitFixed(kind);
                }}
              >
                <td className="py-1 pr-2">{kind}</td>
                <td className="py-1 pr-2">
                  <input
                    type="date"
                    aria-label={`${kind}の開始`}
                    value={draft.start_date}
                    onChange={e => changeFixed(kind, { start_date: e.target.value })}
                    className={ghostInputCls}
                  />
                </td>
                <td className="py-1 pr-2">
                  <input
                    type="date"
                    aria-label={`${kind}の終了または期限`}
                    value={draft.end_date}
                    onChange={e => changeFixed(kind, { end_date: e.target.value })}
                    className={ghostInputCls}
                  />
                </td>
                <td className="py-1 pr-2">
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    aria-label={`${kind}の時間`}
                    value={draft.hours}
                    onChange={e => changeFixed(kind, { hours: e.target.value })}
                    className={`${ghostInputCls} text-right`}
                  />
                </td>
                <td className="py-1 pr-2">
                  <input
                    aria-label={`${kind}のメモ`}
                    value={draft.memo}
                    onChange={e => changeFixed(kind, { memo: e.target.value })}
                    className={ghostInputCls}
                  />
                </td>
                <td />
                <td />
              </tr>
            )];
          })}
          {orderedSchedules
            .filter(schedule => !FIXED_SCHEDULE_KINDS.includes(schedule.kind))
            .map(schedule => renderScheduleRow(schedule))}
          <tr
            className="text-slate-400"
            onBlur={event => {
              if (!event.currentTarget.contains(event.relatedTarget)) commitBlank();
            }}
          >
            <td className="py-1 pr-2">
              <select
                aria-label="予定の種類"
                value={blank.kind}
                onChange={e => changeBlank({ kind: e.target.value as ScheduleKind })}
                className={`${ghostInputCls} ${blankKindRequired ? 'border-red-400' : ''}`}
              >
                <option value="">＋ 予定を追加（種類を選ぶ）</option>
                {SCHEDULE_KINDS.map(k => <option key={k} value={k}>{k}</option>)}
              </select>
            </td>
            <td className="py-1 pr-2">
              <input
                type="date"
                aria-label="予定の開始"
                value={blank.start_date}
                onChange={e => changeBlank({ start_date: e.target.value })}
                className={ghostInputCls}
              />
            </td>
            <td className="py-1 pr-2">
              <input
                type="date"
                aria-label="予定の終了または期限"
                value={blank.end_date}
                onChange={e => changeBlank({ end_date: e.target.value })}
                className={ghostInputCls}
              />
            </td>
            <td className="py-1 pr-2">
              <input
                type="number"
                min={0}
                step={0.5}
                aria-label="予定の時間"
                value={blank.hours}
                onChange={e => changeBlank({ hours: e.target.value })}
                className={`${ghostInputCls} text-right`}
              />
            </td>
            <td className="py-1 pr-2">
              <input
                aria-label="予定のメモ"
                value={blank.memo}
                onChange={e => changeBlank({ memo: e.target.value })}
                className={ghostInputCls}
              />
            </td>
            <td />
            <td />
          </tr>
        </tbody>
      </table>
      {updateMutation.isError && (
        <p className="text-xs text-red-600 mt-2">予定を保存できませんでした。日付か時間のどれかは必要です。</p>
      )}
    </div>
  );

  function renderScheduleRow(s: ProjectSchedule) {
    return (
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
                {s.kind === 'その他' && (
                  <input
                    aria-label="予定の工程名"
                    placeholder="工程名"
                    defaultValue={s.name}
                    onBlur={e => e.target.value !== s.name && update(s, { name: e.target.value })}
                    className={`${inputCls} mt-1`}
                  />
                )}
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
                  defaultValue={s.end_date ?? ''}
                  onBlur={e => e.target.value !== (s.end_date ?? '') && update(s, { end_date: e.target.value || null })}
                  title={s.kind === '製作' && s.start_date && !s.end_date
                    ? '空なら時間（無ければ見積の工数）から終了を出します'
                    : undefined}
                  className={inputCls}
                />
              </td>
              <td className="py-1 pr-2">
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  aria-label="予定の時間"
                  defaultValue={s.hours === null ? '' : formatHours(s.hours)}
                  onBlur={e => parseHours(e.target.value) !== s.hours && update(s, { hours: parseHours(e.target.value) })}
                  className={hoursCls}
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
    );
  }
}
