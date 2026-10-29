import { useState } from 'react';
import { useCreateProjectSchedule } from '../../api/projectSchedules';
import { SCHEDULE_KINDS } from '../../types/projectSchedule';
import type { ScheduleKind } from '../../types/projectSchedule';

interface ScheduleAddModalProps {
  projectId: number;
  projectName: string;
  defaultDate: string;
  onClose: () => void;
}

const fieldStyle: React.CSSProperties = { display: 'block', width: '100%', padding: '4px 8px', border: '1px solid #cbd5e1', borderRadius: 4 };

export default function ScheduleAddModal({ projectId, projectName, defaultDate, onClose }: ScheduleAddModalProps) {
  const createMutation = useCreateProjectSchedule(projectId);
  const [kind, setKind] = useState<ScheduleKind>('見積');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState(defaultDate);
  const [hours, setHours] = useState('');
  const [memo, setMemo] = useState('');
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const hoursValue = hours === '' ? null : Number(hours);
    if (!startDate && !endDate && hoursValue === null) {
      setError('日付か時間のどれかを入れてください');
      return;
    }
    createMutation.mutate(
      { kind, start_date: startDate || null, end_date: endDate || null, hours: hoursValue, memo },
      { onSuccess: onClose, onError: () => setError('保存に失敗しました') },
    );
  }

  return (
    <div
      role="dialog"
      aria-label="予定を追加"
      style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onMouseDown={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onMouseDown={event => event.stopPropagation()}
        style={{ background: '#fff', borderRadius: 8, padding: 20, width: 340, display: 'grid', gap: 10 }}
      >
        <h2 style={{ fontWeight: 700 }}>予定を追加（{projectName}）</h2>
        <label>
          種類
          <select value={kind} onChange={e => setKind(e.target.value as ScheduleKind)} style={fieldStyle}>
            {SCHEDULE_KINDS.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
        </label>
        <label>
          開始（期限だけなら空）
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={fieldStyle} />
        </label>
        <label>
          終了/期限
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={fieldStyle} />
        </label>
        <label>
          時間
          <input
            type="number"
            min={0}
            step={0.5}
            value={hours}
            onChange={e => setHours(e.target.value)}
            style={{ ...fieldStyle, textAlign: 'right' }}
          />
        </label>
        <label>
          メモ
          <input value={memo} onChange={e => setMemo(e.target.value)} style={fieldStyle} />
        </label>
        {error && <div style={{ color: '#c2453a', fontSize: 13 }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" onClick={onClose}>キャンセル</button>
          <button type="submit" disabled={createMutation.isPending}>追加</button>
        </div>
      </form>
    </div>
  );
}
