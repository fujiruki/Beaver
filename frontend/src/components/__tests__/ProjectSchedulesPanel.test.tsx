import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ProjectSchedulesPanel from '../ProjectSchedulesPanel';
import type { ProjectSchedule } from '../../types/projectSchedule';

const schedule = (over: Partial<ProjectSchedule>): ProjectSchedule => ({
  id: 1, project_id: 5, kind: '見積', name: '', start_date: null, end_date: '2026-11-05', hours: null,
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

  it('列は 済・種類・開始・終了/期限・時間・メモ', async () => {
    stubFetch();
    renderPanel();
    await screen.findAllByTestId('fixed-schedule-row');
    const heads = screen.getAllByRole('columnheader').map(h => h.textContent);
    expect(heads.slice(0, 6)).toEqual(['済', '種類', '開始', '終了/期限', '時間(h)', 'メモ']);
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

  it('薄い字の行は、開始日を入れて同じ行を移動しても値を保ち、行を出たとき1回だけ作られる', async () => {
    stubFetch();
    renderPanel();
    const row = (await screen.findAllByTestId('fixed-schedule-row'))[1];
    const start = within(row).getByLabelText('見積の開始') as HTMLInputElement;
    const hours = within(row).getByLabelText('見積の時間');

    fireEvent.change(start, { target: { value: '2026-11-20' } });
    expect(writes).toHaveLength(0);

    fireEvent.blur(start, { relatedTarget: hours });
    fireEvent.focus(hours);
    expect(start.value).toBe('2026-11-20');
    expect(writes).toHaveLength(0);

    fireEvent.blur(hours, { relatedTarget: document.body });
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0].body).toMatchObject({ kind: '見積', start_date: '2026-11-20' });
  });

  it('何も入れていない薄い字の行は作られない', async () => {
    stubFetch();
    renderPanel();
    const row = (await screen.findAllByTestId('fixed-schedule-row'))[0];
    fireEvent.blur(within(row).getByLabelText('現調の時間'));
    expect(writes).toHaveLength(0);
  });

  it('製作の終了が空でも「（時間から）」は出さない', async () => {
    current = [schedule({ id: 2, kind: '製作', start_date: '2026-11-10', end_date: null, hours: 8 })];
    stubFetch();
    renderPanel();
    await screen.findByDisplayValue('2026-11-10');
    expect(screen.queryByText('（時間から）')).toBeNull();
  });

  it('表を包む横スクロールの箱がなく、表は固定レイアウトになる', async () => {
    stubFetch();
    const { container } = renderPanel();
    await screen.findAllByTestId('fixed-schedule-row');
    expect(container.querySelector('.overflow-x-auto')).toBeNull();
    expect(container.querySelector('table')?.className).toMatch(/pd-sched/);
  });

  it('時間は予定の行に出て、右寄せで直せる', async () => {
    current = [schedule({ id: 3, kind: '見積', hours: 1.5 })];
    stubFetch();
    renderPanel();
    const hours = (await screen.findByDisplayValue('1.5')) as HTMLInputElement;
    expect(hours.value).toBe('1.5');
    expect(hours.className).toMatch(/pd-number/);
    fireEvent.change(hours, { target: { value: '2' } });
    fireEvent.blur(hours);
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({ method: 'PUT', body: { hours: 2 } });
  });

  it('末尾の追加行は、種類を選ぶまで値を保ち、選んで行を出たときだけ作られる', async () => {
    stubFetch();
    renderPanel();
    await screen.findAllByTestId('fixed-schedule-row');
    const blankStart = screen.getAllByLabelText('予定の開始').slice(-1)[0] as HTMLInputElement;
    fireEvent.change(blankStart, { target: { value: '2026-12-01' } });
    expect(writes).toHaveLength(0);
    fireEvent.blur(blankStart, { relatedTarget: document.body });
    expect(writes).toHaveLength(0);
    expect(blankStart.value).toBe('2026-12-01');

    const kind = screen.getAllByLabelText('予定の種類').slice(-1)[0];
    fireEvent.change(kind, { target: { value: '打合せ' } });
    fireEvent.blur(kind, { relatedTarget: document.body });
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0].body).toMatchObject({ kind: '打合せ', start_date: '2026-12-01' });
  });

  it('取り直したデータの日付順が変わっても、表内にフォーカスがある間は保存済み行が動かない', async () => {
    current = [
      schedule({ id: 10, kind: '見積依頼', start_date: '2026-11-01', memo: '先の行' }),
      schedule({ id: 20, kind: '打合せ', start_date: '2026-11-02', memo: '後の行' }),
    ];
    stubFetch();
    renderPanel();

    const firstMemo = await screen.findByDisplayValue('先の行');
    const firstStart = within(firstMemo.closest('tr')!).getByLabelText('予定の開始');
    fireEvent.focus(firstStart);
    fireEvent.change(firstStart, { target: { value: '2026-12-31' } });
    current = [current[1], { ...current[0], start_date: '2026-12-31' }];
    fireEvent.blur(firstStart, { relatedTarget: firstMemo });
    fireEvent.focus(firstMemo);

    await waitFor(() => expect(writes).toHaveLength(1));
    await waitFor(() => {
      const memo = screen.getAllByLabelText('予定のメモ')[0] as HTMLInputElement;
      expect(memo.value).toBe('先の行');
    });
  });

  it('薄い字の行は、保存の応答が返るまでのあいだも入れた値が見えている', async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (method === 'GET') return new Response(JSON.stringify(current), { status: 200 });
      writes.push({ method, path: String(url), body: JSON.parse(String(init?.body ?? '{}')) });
      await gate;
      current = [schedule({ id: 99, kind: '現調', hours: 1, end_date: null })];
      return new Response(JSON.stringify(current[0]), { status: 200 });
    }));
    writes = [];
    renderPanel();
    const row = (await screen.findAllByTestId('fixed-schedule-row'))[0];
    const hours = within(row).getByLabelText('現調の時間') as HTMLInputElement;
    fireEvent.change(hours, { target: { value: '1' } });
    fireEvent.blur(hours, { relatedTarget: document.body });
    await waitFor(() => expect(writes).toHaveLength(1));
    expect((within(row).getByLabelText('現調の時間') as HTMLInputElement).value).toBe('1');
    release();
    await waitFor(() => expect(screen.getByDisplayValue('1')).toBeTruthy());
  });

  it('保存が失敗したら、薄い字の行に入れた値が残る', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      if ((init?.method ?? 'GET') === 'GET') return new Response('[]', { status: 200 });
      return new Response(JSON.stringify({ error: 'x' }), { status: 500 });
    }));
    renderPanel();
    const row = (await screen.findAllByTestId('fixed-schedule-row'))[0];
    const hours = within(row).getByLabelText('現調の時間') as HTMLInputElement;
    fireEvent.change(hours, { target: { value: '1' } });
    fireEvent.blur(hours, { relatedTarget: document.body });
    await new Promise(r => setTimeout(r, 50));
    expect((within(row).getByLabelText('現調の時間') as HTMLInputElement).value).toBe('1');
  });

  it('保存の応答待ちのあいだに2回行から出ても、作成は1回だけ送られる', async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (method === 'GET') return new Response(JSON.stringify(current), { status: 200 });
      writes.push({ method, path: String(url), body: JSON.parse(String(init?.body ?? '{}')) });
      await gate;
      return new Response(JSON.stringify(schedule({ id: 99, kind: '現調', hours: 1 })), { status: 200 });
    }));
    writes = [];
    renderPanel();
    const row = (await screen.findAllByTestId('fixed-schedule-row'))[0];
    const hours = within(row).getByLabelText('現調の時間') as HTMLInputElement;
    fireEvent.change(hours, { target: { value: '1' } });
    fireEvent.blur(hours, { relatedTarget: document.body });
    await waitFor(() => expect(writes).toHaveLength(1));
    fireEvent.blur(hours, { relatedTarget: document.body });
    await new Promise(r => setTimeout(r, 30));
    expect(writes).toHaveLength(1);
    release();
  });

  it('行は現調・見積・製作・取付、その他の種類、空の行の順に並ぶ', async () => {
    current = [
      schedule({ id: 30, kind: '打合せ', memo: 'その他' }),
      schedule({ id: 20, kind: '取付', memo: '取付済み' }),
      schedule({ id: 10, kind: '見積', memo: '見積済み' }),
    ];
    stubFetch();
    const { container } = renderPanel();
    await screen.findAllByTestId('fixed-schedule-row');

    const rows = Array.from(container.querySelectorAll('tbody tr'));
    const labels = rows.map(row => {
      const fixedKind = row.getAttribute('data-kind');
      if (fixedKind) return fixedKind;
      const memo = row.querySelector<HTMLInputElement>('input[aria-label="予定のメモ"]');
      if (memo?.value) return memo.value;
      return '空の行';
    });
    expect(labels).toEqual(['現調', '見積済み', '製作', '取付済み', 'その他', '空の行']);
  });
});
