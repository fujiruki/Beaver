import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ScheduleAddModal from '../ScheduleAddModal';

describe('ScheduleAddModal（R-0222）', () => {
  function renderModal() {
    const writes: Record<string, unknown>[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') writes.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify({ id: 1 }), { status: 201 });
    }));
    const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <ScheduleAddModal projectId={5} projectName="田中邸" defaultDate="2026-11-01" onClose={vi.fn()} />
      </QueryClientProvider>,
    );
    return writes;
  }

  it('種類に製作を選べ、時間も入れて追加できる', async () => {
    const writes = renderModal();
    fireEvent.change(screen.getByLabelText('種類'), { target: { value: '製作' } });
    fireEvent.change(screen.getByLabelText('時間'), { target: { value: '6' } });
    fireEvent.click(screen.getByRole('button', { name: '追加' }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({ kind: '製作', hours: 6, end_date: '2026-11-01' });
  });

  it('日付も時間も空なら追加できない', async () => {
    const writes = renderModal();
    fireEvent.change(screen.getByLabelText(/終了/), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: '追加' }));
    expect(await screen.findByText('日付か時間のどれかを入れてください')).toBeTruthy();
    expect(writes).toHaveLength(0);
  });
});
