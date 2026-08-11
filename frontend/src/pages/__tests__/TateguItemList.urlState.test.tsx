import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import TateguItemList from '../TateguItemList';

const ALL_ITEMS = [
  { id: 1, item_code: 'T-1', name: '片開きドア', spec: null, cost_body: 1000, cost_hardware: 200, cost_glass: 0, cost_factory_hours: 1, cost_site_hours: 1, cost_labor_rate: 100, unit: '枚' },
  { id: 2, item_code: 'T-2', name: '引き戸', spec: null, cost_body: 2000, cost_hardware: 300, cost_glass: 0, cost_factory_hours: 2, cost_site_hours: 1, cost_labor_rate: 100, unit: '枚' },
];

let requestedUrls: string[] = [];

beforeEach(() => {
  localStorage.clear();
  requestedUrls = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    requestedUrls.push(url);
    return new Response(JSON.stringify({
      data: ALL_ITEMS,
      meta: { total: ALL_ITEMS.length, page: 1, per_page: 50, last_page: 2 },
    }), { status: 200 });
  }));
});

function renderPage(initialEntries?: string[]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={initialEntries ?? ['/tategu']}>
        <TateguItemList />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('TateguItemList URL状態保持 (R-0096 Phase1)', () => {
  it('検索語を入力すると検索APIリクエストのqパラメータに反映される', async () => {
    renderPage();
    await waitFor(() => expect(requestedUrls.length).toBeGreaterThan(0));
    const input = await screen.findByPlaceholderText('品番・品名・仕様で検索');
    fireEvent.change(input, { target: { value: 'ひきど' } });

    await waitFor(() => {
      const last = new URL(requestedUrls[requestedUrls.length - 1], 'http://localhost');
      expect(last.searchParams.get('q')).toBe('ひきど');
    });
  });

  it('URLにq/sort/order/pageが既に入っている状態から表示すると、その状態が復元される', async () => {
    renderPage(['/tategu?q=%E3%83%89%E3%82%A2&sort=name&order=desc&page=1']);
    await waitFor(() => expect(requestedUrls.length).toBeGreaterThan(0));

    const input = await screen.findByPlaceholderText('品番・品名・仕様で検索') as HTMLInputElement;
    expect(input.value).toBe('ドア');

    const last = new URL(requestedUrls[requestedUrls.length - 1], 'http://localhost');
    expect(last.searchParams.get('sort')).toBe('name');
    expect(last.searchParams.get('order')).toBe('desc');
    expect(last.searchParams.get('q')).toBe('ドア');
  });

  it('列見出しクリックでソートするとURLのsort/orderが更新される', async () => {
    renderPage();
    await waitFor(() => expect(requestedUrls.length).toBeGreaterThan(0));

    fireEvent.click(await screen.findByText('品名'));

    await waitFor(() => {
      const last = new URL(requestedUrls[requestedUrls.length - 1], 'http://localhost');
      expect(last.searchParams.get('sort')).toBe('name');
      expect(last.searchParams.get('order')).toBe('asc');
    });
  });
});
