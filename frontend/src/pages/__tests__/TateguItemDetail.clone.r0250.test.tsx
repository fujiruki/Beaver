import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import TateguItemDetail from '../TateguItemDetail';

const source = {
  id: 9,
  code: '00009',
  name: '元の障子',
  description: '元の備考',
  base_catalog_item_name: null,
  cost_body: 100,
  cost_hardware: 0,
  cost_glass: 0,
  cost_factory_hours: 0,
  cost_site_hours: 0,
  cost_labor_rate: 0,
  unit: '枚',
  memo: null,
  status: 'archived',
  created_at: '2026-01-01 00:00:00',
  updated_at: '2026-01-01 00:00:00',
  cost_breakdown: [],
  cost_lines: [
    { id: 1, tategu_item_id: 9, category_code: 'MAIN', name: '桟', quantity: 2, unit_cost: 50, amount: 100, source: 'wood_calc', sort_order: 0 },
  ],
  labor_lines: [],
};

let calls: { url: string; method: string; body?: string }[] = [];

beforeEach(() => {
  calls = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method ?? 'GET', body: init?.body as string | undefined });
    const u = new URL(url, 'http://localhost');
    if (u.pathname.endsWith('/aggregation-categories')) return new Response(JSON.stringify([]), { status: 200 });
    if (init?.method === 'POST') return new Response(JSON.stringify({ ...source, id: 10, code: null }), { status: 201 });
    if (init?.method === 'PUT') return new Response(JSON.stringify({ ok: true }), { status: 200 });
    return new Response(JSON.stringify(source), { status: 200 });
  }));
});

function renderClone() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[{ pathname: '/tategu/new', state: { cloneFromId: 9 } }]}>
        <Routes>
          <Route path="/tategu/new" element={<TateguItemDetail />} />
          <Route path="/tategu" element={<div>一覧画面</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('TateguItemDetail 引用 (R-0250)', () => {
  it('引用元の中身が入り、製品№は空で、見出しの近くに引用元が出る', async () => {
    renderClone();
    expect(await screen.findByText('（引用元 製品№ 00009）')).toBeTruthy();
    expect((screen.getByDisplayValue('元の障子') as HTMLInputElement).value).toBe('元の障子');
    expect(screen.getByDisplayValue('元の備考')).toBeTruthy();
    expect((screen.getByPlaceholderText('採番待ち') as HTMLInputElement).value).toBe('');
    expect(screen.getByDisplayValue('桟')).toBeTruthy();
  });

  it('保存すると新規作成（POST）し、木材原価計算の行は手入力の行として保存する。元の台帳は更新しない', async () => {
    renderClone();
    await screen.findByText('（引用元 製品№ 00009）');
    await userEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => {
      const post = calls.find(c => c.method === 'POST' && c.url.endsWith('/tategu-items'));
      expect(post).toBeTruthy();
      expect(JSON.parse(post!.body!).name).toBe('元の障子');
      expect(JSON.parse(post!.body!).code ?? null).toBeNull();
      const lines = calls.find(c => c.method === 'PUT' && c.url.endsWith('/tategu-items/10/cost-lines'));
      expect(JSON.parse(lines!.body!).lines[0]).toMatchObject({ name: '桟', source: 'manual' });
    });
    expect(calls.some(c => c.method === 'PUT' && c.url.includes('/tategu-items/9'))).toBe(false);
  });
});
