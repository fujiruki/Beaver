import { Fragment, useState } from 'react';
import type { ProjectSchedule } from '../../types/projectSchedule';
import { formatMD, isScheduleOverdue, scheduleLabel, todoSchedules } from './dandoriBoardUtils';

interface TodoPanelProps {
  schedules: ProjectSchedule[];
  projectNames: Map<number, string>;
  todayISO: string;
  onToggleDone: (id: number, done: boolean) => void;
  onOpenProject: (projectId: number) => void;
}

export default function TodoPanel({ schedules, projectNames, todayISO, onToggleDone, onOpenProject }: TodoPanelProps) {
  const [showDone, setShowDone] = useState(false);
  const rows = todoSchedules(schedules.filter(s => projectNames.has(s.project_id)), showDone);
  const firstUndatedId = rows.find(s => !s.end_date && !s.start_date)?.id;

  return (
    <aside className="todo-panel" aria-label="やること">
      <div className="todo-head">
        <b>やること</b>
        <label>
          <input type="checkbox" checked={showDone} onChange={e => setShowDone(e.target.checked)} />
          済も表示
        </label>
      </div>
      {rows.length === 0 && <div className="todo-empty">やることはありません</div>}
      <ul>
        {rows.map(s => {
          const date = s.end_date ?? s.start_date;
          return (
            <Fragment key={s.id}>
              {s.id === firstUndatedId && <li className="todo-undated-head">日付未定</li>}
              <li className={s.done ? 'done' : ''}>
                <input
                  type="checkbox"
                  aria-label={`${s.kind}を済にする`}
                  checked={!!s.done}
                  onChange={e => onToggleDone(s.id, e.target.checked)}
                />
                {date && (
                  <span className={isScheduleOverdue(s, todayISO) ? 'todo-date overdue' : 'todo-date'}>{formatMD(date)}</span>
                )}
                <span className="todo-what">{scheduleLabel(s)}{s.memo && `（${s.memo}）`}</span>
                <button type="button" className="todo-project" onClick={() => onOpenProject(s.project_id)}>
                  {projectNames.get(s.project_id)}
                </button>
              </li>
            </Fragment>
          );
        })}
      </ul>
    </aside>
  );
}
