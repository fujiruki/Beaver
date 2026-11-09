import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import TateguItemList from '../TateguItemList';

const base = { description: null, cost_body: 1000, cost_hardware: 0, cost_glass: 0, cost_factory_hours: 0, cost_site_hours: 0, cost_labor_rate: 0, unit: '枚', is_favorite: 0 };
let items: Record<string, unknown>[] = [];
let calls: { url: string; method: string; body?: string }[] = [];

beforeEach(() => {
  localStorage.clear();
  calls = [];
  items = [
    { ...base, id: 1, code: '00001', name: '片開きドア', catalog_names: [], catalog_ids: [] },
    { ...base, id: 2, code: '00002', name: '引き戸', catalog_names: ['障子カタログ'], catalog_ids: [7] },
    { ...base, id: 3, code: '00003', name: '框戸', catalog_names: ['障子カタログ', '框カタログ'], catalog_ids: [7, 8] },
  ];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    calls.push({ url, method, body: init?.body as string | undefined });
    if (url.endsWith('/ledger-catalogs')) return new Response(JSON.stringify([
      { id: 7, name: '障子カタログ', sort_order: 1, item_count: 2 },
      { id: 8, name: '框カタログ', sort_order: 2, item_count: 1 },
    ]), { status: 200 });
    if (url.endsWith('/ledger-catalogs/7/items')) {
      if (method === 'PUT') {
        items[1] = { ...items[1], catalog_names: [], catalog_ids: [] };
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return new Response(JSON.stringify([items[1], items[2]]), { status: 200 });
    }
    return new Response(JSON.stringify({ data: items, meta: { total: 3, page: 1, per_page: 50, last_page: 1 } }), { status: 200 });
  }));
});

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/tategu']}>
        <Routes><Route path="/tategu" element={<TateguItemList />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function rowOf(text: string) {
  return screen.getByText(text).closest('tr') as HTMLElement;
}

describe('TateguItemList 入っているカタログの名前 (R-0253)', () => {
  it('入っていない行は「カタログに追加▼」、入っている行はカタログ名（2つは「、」でつなぐ）', async () => {
    renderPage();
    await screen.findByText('片開きドア');
    const b1 = within(rowOf('片開きドア')).getByRole('button', { name: 'カタログに追加' });
    expect(b1.textContent).toBe('カタログに追加▼');
    expect(b1.getAttribute('type')).toBe('button');
    const b2 = within(rowOf('引き戸')).getByRole('button', { name: /障子カタログ/ });
    expect(b2.textContent).toBe('障子カタログ▼');
    const b3 = within(rowOf('框戸')).getByRole('button', { name: /障子カタログ、框カタログ/ });
    expect(b3.getAttribute('title')).toBe('障子カタログ、框カタログ');
    expect(b2.className).toContain('text-slate-800');
  });

  it('画面表示時にカタログの一覧を取りに行かない', async () => {
    renderPage();
    await screen.findByText('片開きドア');
    expect(calls.some(c => c.url.endsWith('/ledger-catalogs'))).toBe(false);
  });

  it('メニューで入っているカタログに ✓ が付き、押すとそのカタログから外れてボタンが戻る', async () => {
    renderPage();
    await screen.findByText('引き戸');
    fireEvent.click(within(rowOf('引き戸')).getByRole('button', { name: /障子カタログ/ }));
    const checked = await screen.findByRole('menuitem', { name: /✓.*障子カタログ/ });
    expect(screen.getByRole('menuitem', { name: '框カタログ' })).toBeTruthy();
    fireEvent.click(checked);
    await waitFor(() => {
      const put = calls.find(c => c.method === 'PUT' && c.url.endsWith('/ledger-catalogs/7/items'));
      expect(put).toBeTruthy();
      expect(JSON.parse(put!.body!)).toEqual({ tategu_item_ids: [3] });
    });
    await waitFor(() => {
      expect(within(rowOf('引き戸')).getByRole('button', { name: 'カタログに追加' }).textContent).toBe('カタログに追加▼');
    });
  });
});
