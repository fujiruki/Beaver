import { useState } from 'react';
import type { ProjectSchedule } from '../../types/projectSchedule';
import { formatMD, isScheduleOverdue, todoSchedules } from './dandoriBoardUtils';

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
        {rows.map(s => (
          <li key={s.id} className={s.done ? 'done' : ''}>
            <input
              type="checkbox"
              aria-label={`${s.kind}を済にする`}
              checked={!!s.done}
              onChange={e => onToggleDone(s.id, e.target.checked)}
            />
            <span className={isScheduleOverdue(s, todayISO) ? 'todo-date overdue' : 'todo-date'}>{formatMD(s.end_date)}</span>
            <span className="todo-what">{s.kind}{s.memo && `（${s.memo}）`}</span>
            <button type="button" className="todo-project" onClick={() => onOpenProject(s.project_id)}>
              {projectNames.get(s.project_id)}
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
