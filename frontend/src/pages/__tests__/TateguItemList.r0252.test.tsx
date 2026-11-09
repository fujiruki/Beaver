import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import TateguItemList from '../TateguItemList';

const ITEMS = [
  { id: 1, code: '00001', name: '片開きドア', description: null, cost_body: 1000, cost_hardware: 0, cost_glass: 0, cost_factory_hours: 0, cost_site_hours: 0, cost_labor_rate: 0, unit: '枚', is_favorite: 1 },
  { id: 2, code: '00002', name: '引き戸', description: null, cost_body: 2000, cost_hardware: 0, cost_glass: 0, cost_factory_hours: 0, cost_site_hours: 0, cost_labor_rate: 0, unit: '枚', is_favorite: 0 },
];

let calls: { url: string; method: string; body?: string }[] = [];

beforeEach(() => {
  localStorage.clear();
  calls = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method ?? 'GET', body: init?.body as string | undefined });
    if (url.endsWith('/ledger-catalogs')) return new Response(JSON.stringify([{ id: 7, name: '障子カタログ', sort_order: 1, item_count: 1 }]), { status: 200 });
    if (url.endsWith('/ledger-catalogs/7/items')) return new Response(JSON.stringify([ITEMS[0]]), { status: 200 });
    if (url.includes('/favorite')) return new Response(JSON.stringify({ ok: true }), { status: 200 });
    return new Response(JSON.stringify({ data: ITEMS, meta: { total: 2, page: 1, per_page: 50, last_page: 1 } }), { status: 200 });
  }));
});

function CloneStub() {
  const location = useLocation();
  return <div>新規画面 clone={String((location.state as { cloneFromId?: number } | null)?.cloneFromId)}</div>;
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/tategu']}>
        <Routes>
          <Route path="/tategu" element={<TateguItemList />} />
          <Route path="/tategu/new" element={<CloneStub />} />
          <Route path="/tategu/catalogs" element={<div>カタログ編集画面</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('TateguItemList お気に入り・カタログ・引用 (R-0252 / R-0250)', () => {
  it('各行の先頭に ★／☆ があり、押すと favorite を PUT する', async () => {
    renderPage();
    const row1 = (await screen.findByText('片開きドア')).closest('tr') as HTMLElement;
    const row2 = screen.getByText('引き戸').closest('tr') as HTMLElement;
    expect(within(row1).getByRole('button', { name: 'お気に入りを外す' }).textContent).toBe('★');
    fireEvent.click(within(row2).getByRole('button', { name: 'お気に入りにする' }));
    await waitFor(() => {
      const put = calls.find(c => c.method === 'PUT' && c.url.endsWith('/tategu-items/2/favorite'));
      expect(put).toBeTruthy();
      expect(JSON.parse(put!.body!)).toEqual({ is_favorite: true });
    });
    expect(screen.queryByText(/新規画面/)).toBeNull();
  });

  it('「お気に入りだけ」を入れると favorite=1 で取り直す', async () => {
    renderPage();
    await screen.findByText('片開きドア');
    fireEvent.click(screen.getByLabelText('お気に入りだけ'));
    await waitFor(() => {
      const urls = calls.filter(c => c.url.includes('/tategu-items?'));
      const last = new URL(urls[urls.length - 1].url, 'http://localhost');
      expect(last.searchParams.get('favorite')).toBe('1');
    });
  });

  it('「カタログに追加」で既存のカタログを選ぶと、中身の末尾に足して保存する', async () => {
    renderPage();
    const row2 = (await screen.findByText('引き戸')).closest('tr') as HTMLElement;
    fireEvent.click(within(row2).getByRole('button', { name: 'カタログに追加' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: '障子カタログ' }));
    await waitFor(() => {
      const put = calls.find(c => c.method === 'PUT' && c.url.endsWith('/ledger-catalogs/7/items'));
      expect(put).toBeTruthy();
      expect(JSON.parse(put!.body!)).toEqual({ tategu_item_ids: [1, 2] });
    });
  });

  it('「カタログを編集」で /tategu/catalogs へ行く', async () => {
    renderPage();
    await screen.findByText('片開きドア');
    fireEvent.click(screen.getByRole('button', { name: 'カタログを編集' }));
    expect(await screen.findByText('カタログ編集画面')).toBeTruthy();
  });

  it('各行の「引用」で元の台帳の id を持って新規の画面へ行く', async () => {
    renderPage();
    const row2 = (await screen.findByText('引き戸')).closest('tr') as HTMLElement;
    fireEvent.click(within(row2).getByRole('button', { name: '引用' }));
    expect(await screen.findByText('新規画面 clone=2')).toBeTruthy();
  });
});
