import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ProjectSchedulesPanel from '../ProjectSchedulesPanel';
import type { ProjectSchedule } from '../../types/projectSchedule';

const schedule = (over: Partial<ProjectSchedule>): ProjectSchedule => ({
  id: 1, project_id: 5, kind: '見積', start_date: null, end_date: '2026-11-05', hours: null,
  memo: '', done: 0, created_at: '', updated_at: '', ...over,
});

let current: ProjectSchedule[] = [];
let writes: { method: string; path: string; body: Record<string, unknown> }[] = [];

function stubFetch() {
  writes = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    if (method === 'GET') return new Response(JSON.stringify(current), { status: 200 });
    writes.push({ method, path: new URL(url, 'http://localhost').pathname, body: JSON.parse(String(init?.body ?? '{}')) });
    return new Response(JSON.stringify(schedule({ id: 99 })), { status: 200 });
  }));
}

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ProjectSchedulesPanel projectId={5} />
    </QueryClientProvider>,
  );
}

describe('ProjectSchedulesPanel（R-0222）', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    current = [];
  });

  it('予定が無い案件には、現調・見積・製作・取付の薄い字の行が表の上に出る', async () => {
    stubFetch();
    renderPanel();
    const rows = await screen.findAllByTestId('fixed-schedule-row');
    expect(rows.map(r => r.getAttribute('data-kind'))).toEqual(['現調', '見積', '製作', '取付']);
  });

  it('列は 種類・開始・終了/期限・時間・メモ・済', async () => {
    stubFetch();
    renderPanel();
    await screen.findAllByTestId('fixed-schedule-row');
    const heads = screen.getAllByRole('columnheader').map(h => h.textContent);
    expect(heads.slice(0, 6)).toEqual(['種類', '開始', '終了/期限', '時間', 'メモ', '済']);
  });

  it('開始日の欄を示す「製作: 開始日・工数は上の欄」の案内は無い', async () => {
    stubFetch();
    renderPanel();
    await screen.findAllByTestId('fixed-schedule-row');
    expect(screen.queryByText(/開始日・工数は上の欄/)).toBeNull();
  });

  it('その種類の予定が1行でもあれば、その種類の薄い字の行は出ない', async () => {
    current = [schedule({ id: 1, kind: '見積' }), schedule({ id: 2, kind: '製作', start_date: '2026-11-10', end_date: null })];
    stubFetch();
    renderPanel();
    const rows = await screen.findAllByTestId('fixed-schedule-row');
    expect(rows.map(r => r.getAttribute('data-kind'))).toEqual(['現調', '取付']);
  });

  it('薄い字の行に時間だけ入れても予定として作られる', async () => {
    stubFetch();
    renderPanel();
    const row = (await screen.findAllByTestId('fixed-schedule-row'))[2];
    const hours = within(row).getByLabelText('製作の時間');
    fireEvent.change(hours, { target: { value: '12.5' } });
    fireEvent.blur(hours);
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0].method).toBe('POST');
    expect(writes[0].path).toMatch(/\/projects\/5\/schedules$/);
    expect(writes[0].body).toMatchObject({ kind: '製作', hours: 12.5 });
  });

  it('薄い字の行に開始日を入れると、その種類の予定が作られる', async () => {
    stubFetch();
    renderPanel();
    const row = (await screen.findAllByTestId('fixed-schedule-row'))[3];
    fireEvent.change(within(row).getByLabelText('取付の開始'), { target: { value: '2026-11-20' } });
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0].body).toMatchObject({ kind: '取付', start_date: '2026-11-20' });
  });

  it('何も入れていない薄い字の行は作られない', async () => {
    stubFetch();
    renderPanel();
    const row = (await screen.findAllByTestId('fixed-schedule-row'))[0];
    fireEvent.blur(within(row).getByLabelText('現調の時間'));
    expect(writes).toHaveLength(0);
  });

  it('製作の終了が空なら「（時間から）」と薄く出る。終了があれば出ない', async () => {
    current = [schedule({ id: 2, kind: '製作', start_date: '2026-11-10', end_date: null, hours: 8 })];
    stubFetch();
    renderPanel();
    expect(await screen.findByText('（時間から）')).toBeTruthy();
  });

  it('時間は予定の行に出て、右寄せで直せる', async () => {
    current = [schedule({ id: 3, kind: '見積', hours: 1.5 })];
    stubFetch();
    renderPanel();
    const hours = (await screen.findByDisplayValue('1.5')) as HTMLInputElement;
    expect(hours.value).toBe('1.5');
    expect(hours.className).toMatch(/text-right/);
    fireEvent.change(hours, { target: { value: '2' } });
    fireEvent.blur(hours);
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({ method: 'PUT', body: { hours: 2 } });
  });

  it('末尾の空の行に開始日を入れると、選んだ種類（未選択なら見積）で作られる', async () => {
    stubFetch();
    renderPanel();
    await screen.findAllByTestId('fixed-schedule-row');
    const blankStart = screen.getAllByLabelText('予定の開始').slice(-1)[0];
    fireEvent.change(blankStart, { target: { value: '2026-12-01' } });
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0].body).toMatchObject({ kind: '見積', start_date: '2026-12-01' });
  });
});
