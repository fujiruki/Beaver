import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import TodoPanel from '../TodoPanel';

const sch = (over: object) => ({
  id: 1, project_id: 1, kind: '見積', start_date: null, end_date: '2026-11-05', hours: null,
  memo: '', done: 0, created_at: '', updated_at: '', ...over,
});

describe('TodoPanel（R-0222: 日付の無い予定は「日付未定」にまとめる）', () => {
  const renderPanel = (schedules: object[]) =>
    render(
      <TodoPanel
        schedules={schedules as never}
        projectNames={new Map([[1, '田中邸']])}
        todayISO="2026-11-01"
        onToggleDone={vi.fn()}
        onOpenProject={vi.fn()}
      />,
    );

  it('日付のある予定の後ろに「日付未定」の見出しと、日付の無い予定が並ぶ', () => {
    const { container } = renderPanel([
      sch({ id: 1, kind: '製作', end_date: null, hours: 8 }),
      sch({ id: 2, kind: '見積', end_date: '2026-11-05' }),
    ]);
    const items = Array.from(container.querySelectorAll('li')).map(li => li.textContent);
    expect(items[0]).toContain('見積');
    expect(items[1]).toBe('日付未定');
    expect(items[2]).toContain('製作');
  });

  it('日付の無い予定が無ければ「日付未定」は出ない', () => {
    renderPanel([sch({ id: 2 })]);
    expect(screen.queryByText('日付未定')).toBeNull();
  });
});
