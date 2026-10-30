import { useEffect, useRef, useState } from 'react';
import {
  useProjectSchedules,
  useCreateProjectSchedule,
  useUpdateProjectSchedule,
  useDeleteProjectSchedule,
} from '../api/projectSchedules';
import { SCHEDULE_KINDS, FIXED_SCHEDULE_KINDS } from '../types/projectSchedule';
import type { ProjectSchedule, ProjectScheduleInput, ScheduleKind } from '../types/projectSchedule';
import { formatHours } from './dandori/dandoriBoardUtils';

const inputCls = 'pd-control';
const ghostInputCls = 'pd-control';
const hoursCls = 'pd-control pd-number';

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

interface ProjectSchedulesPanelProps {
  projectId: number;
  onCreated?: (schedule: ProjectSchedule) => void;
  onUpdated?: (schedule: ProjectSchedule, patch: Partial<ProjectScheduleInput>) => void;
  onDeleted?: (schedule: ProjectSchedule) => void;
}

export default function ProjectSchedulesPanel({ projectId, onCreated, onUpdated, onDeleted }: ProjectSchedulesPanelProps) {
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

  function create(kind: ScheduleKind, draft: Draft, onSaved: () => void) {
    createMutation.mutate({
      kind,
      start_date: draft.start_date || null,
      end_date: draft.end_date || null,
      hours: parseHours(draft.hours),
      memo: draft.memo,
    }, {
      onSuccess: created => {
        onSaved();
        onCreated?.(created);
      },
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
    create(kind, draft, () => setFixedDrafts(prev => ({ ...prev, [kind]: EMPTY_DRAFT })));
  }

  function commitBlank() {
    if (!hasContent(blank)) return;
    if (!blank.kind) {
      setBlankKindRequired(true);
      return;
    }
    const kind = blank.kind;
    const draft = blank;
    setBlankKindRequired(false);
    create(kind, draft, () => setBlank(EMPTY_DRAFT));
  }

  function update(schedule: ProjectSchedule, patch: Partial<ProjectSchedule>) {
    updateMutation.mutate({ id: schedule.id, ...patch }, {
      onSuccess: () => onUpdated?.(schedule, patch),
    });
  }

  return (
    <section className="pd-panel">
      <div className="pd-panel-title">予定</div>
      <table className="pd-sched">
        <thead>
          <tr>
            <th className="pd-col-done">済</th>
            <th className="pd-col-kind">種類</th>
            <th className="pd-col-date">開始</th>
            <th className="pd-col-date">終了/期限</th>
            <th className="pd-col-hours">時間(h)</th>
            <th>メモ</th>
            <th className="pd-col-delete" />
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
                className="pd-placeholder-row"
                onBlur={event => {
                  if (!event.currentTarget.contains(event.relatedTarget)) commitFixed(kind);
                }}
              >
                <td className="pd-col-done" />
                <td className="pd-edit-cell"><span className="pd-control">{kind}</span></td>
                <td className="pd-edit-cell">
                  <input
                    type="date"
                    aria-label={`${kind}の開始`}
                    value={draft.start_date}
                    onChange={e => changeFixed(kind, { start_date: e.target.value })}
                    className={`${ghostInputCls} pd-mono ${draft.start_date ? '' : 'pd-empty-date'}`}
                  max="9999-12-31"
                  />
                </td>
                <td className="pd-edit-cell">
                  <input
                    type="date"
                    aria-label={`${kind}の終了または期限`}
                    value={draft.end_date}
                    onChange={e => changeFixed(kind, { end_date: e.target.value })}
                    className={`${ghostInputCls} pd-mono ${draft.end_date ? '' : 'pd-empty-date'}`}
                  max="9999-12-31"
                  />
                </td>
                <td className="pd-edit-cell">
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    aria-label={`${kind}の時間`}
                    value={draft.hours}
                    onChange={e => changeFixed(kind, { hours: e.target.value })}
                    className={`${ghostInputCls} pd-number`}
                  />
                </td>
                <td className="pd-edit-cell">
                  <input
                    aria-label={`${kind}のメモ`}
                    value={draft.memo}
                    placeholder="メモ"
                    onChange={e => changeFixed(kind, { memo: e.target.value })}
                    className={ghostInputCls}
                  />
                </td>
                <td className="pd-col-delete" />
              </tr>
            )];
          })}
          {orderedSchedules
            .filter(schedule => !FIXED_SCHEDULE_KINDS.includes(schedule.kind))
            .map(schedule => renderScheduleRow(schedule))}
          <tr
            className={blank.kind || hasContent(blank) ? 'pd-placeholder-row' : 'pd-add-row'}
            onBlur={event => {
              if (!event.currentTarget.contains(event.relatedTarget)) commitBlank();
            }}
          >
            <td className="pd-col-done" />
            <td className="pd-edit-cell" colSpan={blank.kind || hasContent(blank) ? 1 : 6}>
              <select
                aria-label="予定の種類"
                value={blank.kind}
                onChange={e => changeBlank({ kind: e.target.value as ScheduleKind })}
                className={`${ghostInputCls} ${blankKindRequired ? 'pd-invalid' : ''}`}
              >
                <option value="">＋ 予定を追加（種類を選ぶ）</option>
                {SCHEDULE_KINDS.map(k => <option key={k} value={k}>{k}</option>)}
              </select>
              {!blank.kind && !hasContent(blank) && <span className="pd-visually-hidden">
                <input type="date" aria-label="予定の開始" value={blank.start_date} onChange={e => changeBlank({ start_date: e.target.value })} />
                <input type="date" aria-label="予定の終了または期限" value={blank.end_date} onChange={e => changeBlank({ end_date: e.target.value })} />
                <input type="number" aria-label="予定の時間" value={blank.hours} onChange={e => changeBlank({ hours: e.target.value })} />
                <input aria-label="予定のメモ" value={blank.memo} onChange={e => changeBlank({ memo: e.target.value })} />
              </span>}
            </td>
            {(blank.kind || hasContent(blank)) && <><td className="pd-edit-cell">
              <input
                type="date"
                aria-label="予定の開始"
                value={blank.start_date}
                onChange={e => changeBlank({ start_date: e.target.value })}
                className={`${ghostInputCls} pd-mono ${blank.start_date ? '' : 'pd-empty-date'}`}
                max="9999-12-31"
              />
            </td><td className="pd-edit-cell">
              <input
                type="date"
                aria-label="予定の終了または期限"
                value={blank.end_date}
                onChange={e => changeBlank({ end_date: e.target.value })}
                className={`${ghostInputCls} pd-mono ${blank.end_date ? '' : 'pd-empty-date'}`}
                max="9999-12-31"
              />
            </td><td className="pd-edit-cell">
              <input
                type="number"
                min={0}
                step={0.5}
                aria-label="予定の時間"
                value={blank.hours}
                onChange={e => changeBlank({ hours: e.target.value })}
                className={`${ghostInputCls} pd-number`}
              />
            </td><td className="pd-edit-cell">
              <input
                aria-label="予定のメモ"
                value={blank.memo}
                placeholder="メモ"
                onChange={e => changeBlank({ memo: e.target.value })}
                className={ghostInputCls}
              />
            </td><td className="pd-col-delete" /></>}
          </tr>
        </tbody>
      </table>
      {updateMutation.isError && (
        <p className="text-xs text-red-600 mt-2">予定を保存できませんでした。日付か時間のどれかは必要です。</p>
      )}
    </section>
  );

  function renderScheduleRow(s: ProjectSchedule) {
    return (
            <tr key={`${s.id}-${s.updated_at}`}>
              <td className="pd-col-done">
                <input
                  type="checkbox"
                  aria-label="予定が済"
                  checked={!!s.done}
                  onChange={e => update(s, { done: e.target.checked ? 1 : 0 })}
                />
              </td>
              <td className="pd-edit-cell">
                {s.kind === 'その他' ? (
                  <div className="pd-other">
                    <input
                      aria-label="予定の工程名"
                      placeholder="工程名"
                      defaultValue={s.name}
                      onBlur={e => e.target.value !== s.name && update(s, { name: e.target.value })}
                      className={inputCls}
                    />
                    <select
                      aria-label="予定の種類"
                      defaultValue=""
                      onChange={e => update(s, { kind: e.target.value as ScheduleKind })}
                      className="pd-kind-arrow"
                    >
                      <option value="">▼</option>
                      {SCHEDULE_KINDS.filter(k => k !== 'その他').map(k => (
                        <option key={k} value={k}>{k}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <select
                    aria-label="予定の種類"
                    defaultValue={s.kind}
                    onChange={e => update(s, { kind: e.target.value as ScheduleKind })}
                    className={inputCls}
                  >
                    {SCHEDULE_KINDS.map(k => <option key={k} value={k}>{k}</option>)}
                  </select>
                )}
              </td>
              <td className="pd-edit-cell">
                <input
                  type="date"
                  aria-label="予定の開始"
                  defaultValue={s.start_date ?? ''}
                  onBlur={e => e.target.value !== (s.start_date ?? '') && update(s, { start_date: e.target.value || null })}
                  className={`${inputCls} pd-mono ${s.start_date ? '' : 'pd-empty-date'}`}
                  max="9999-12-31"
                />
              </td>
              <td className="pd-edit-cell">
                <input
                  type="date"
                  aria-label="予定の終了または期限"
                  defaultValue={s.end_date ?? ''}
                  onBlur={e => e.target.value !== (s.end_date ?? '') && update(s, { end_date: e.target.value || null })}
                  title={s.kind === '製作' && s.start_date && !s.end_date
                    ? '空なら時間（無ければ見積の工数）から終了を出します'
                    : undefined}
                  className={`${inputCls} pd-mono ${s.end_date ? '' : 'pd-empty-date'}`}
                  max="9999-12-31"
                />
              </td>
              <td className="pd-edit-cell">
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
              <td className="pd-edit-cell">
                <input
                  aria-label="予定のメモ"
                  defaultValue={s.memo}
                  placeholder="メモ"
                  onBlur={e => e.target.value !== s.memo && update(s, { memo: e.target.value })}
                  className={inputCls}
                />
              </td>
              <td className="pd-col-delete">
                <button type="button" onClick={() => deleteMutation.mutate(s.id, { onSuccess: () => onDeleted?.(s) })} className="pd-link pd-link-danger">
                  削除
                </button>
              </td>
            </tr>
    );
  }
}
