import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CapacityCheckPanel from '../CapacityCheckPanel';
import type { CapacityCheckResult } from '../../types/capacityCheck';

const baseResult: CapacityCheckResult = {
  external_project_id: 5,
  feasible: true,
  deadline: '2026-09-10',
  required_minutes: 780,
  placed_minutes: 300,
  unplaced_minutes: 480,
  shortage_minutes: 0,
  earliest_completion_date: '2026-09-08',
  saturated_through: '2026-09-05',
  message: '9/10納期に入ります',
  evaluated_at: '2026-08-26T10:00:00+09:00',
};

function stubFetch(body: unknown) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })));
}

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <CapacityCheckPanel projectId={5} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CapacityCheckPanel (R-0118)', () => {
  it('feasible=true はメッセージを緑で主表示し、判定時刻を添える', async () => {
    stubFetch({ ok: true, result: baseResult });
    renderPanel();
    const msg = await screen.findByText('9/10納期に入ります');
    expect(msg.className).toContain('text-green-700');
    expect(screen.getByText(/2026-08-26T10:00:00\+09:00/)).toBeTruthy();
  });

  it('feasible=false かつ納期ありは赤で表示する', async () => {
    stubFetch({
      ok: true,
      result: { ...baseResult, feasible: false, shortage_minutes: 180, message: '9/10納期では3h不足（9/12なら入る）' },
    });
    renderPanel();
    const msg = await screen.findByText('9/10納期では3h不足（9/12なら入る）');
    expect(msg.className).toContain('text-red-600');
  });

  it('納期未設定（deadline=null）はアンバーで表示し「入らない」と断定しない', async () => {
    stubFetch({
      ok: true,
      result: { ...baseResult, feasible: false, deadline: null, message: '納期未設定・残り20h' },
    });
    renderPanel();
    const msg = await screen.findByText('納期未設定・残り20h');
    expect(msg.className).toContain('text-amber-600');
  });

  it('縮退時（ok:false）はグレーの1行でメッセージを表示する', async () => {
    stubFetch({
      ok: false,
      reason: 'unreachable',
      message: 'Youkanに接続できないため、容量判定は現在利用できません',
    });
    renderPanel();
    const msg = await screen.findByText('Youkanに接続できないため、容量判定は現在利用できません');
    expect(msg.className).toContain('text-slate-500');
  });

  it('「（Beaver再取得失敗・前回同期値で判定）」注記付きmessageはそのまま表示される', async () => {
    stubFetch({
      ok: true,
      result: { ...baseResult, message: '9/10納期に入ります（Beaver再取得失敗・前回同期値で判定）' },
    });
    renderPanel();
    expect(await screen.findByText('9/10納期に入ります（Beaver再取得失敗・前回同期値で判定）')).toBeTruthy();
  });

  it('再判定ボタンがあり、取得中は無効化される', async () => {
    stubFetch({ ok: true, result: baseResult });
    renderPanel();
    await screen.findByText('9/10納期に入ります');
    const btn = screen.getByRole('button', { name: '再判定' }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });
});
