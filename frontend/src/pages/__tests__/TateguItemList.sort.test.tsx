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
  requestedUrls = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    requestedUrls.push(url);
    return new Response(JSON.stringify({
      data: ALL_ITEMS,
      meta: { total: ALL_ITEMS.length, page: 1, per_page: 50, last_page: 1 },
    }), { status: 200 });
  }));
});

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <TateguItemList />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('TateguItemList サーバソート (R-076 Part A)', () => {
  it('初回表示時は sort/order パラメータを付けない', async () => {
    renderPage();
    await waitFor(() => expect(requestedUrls.length).toBeGreaterThan(0));
    const first = new URL(requestedUrls[0], 'http://localhost');
    expect(first.searchParams.has('sort')).toBe(false);
    expect(first.searchParams.has('order')).toBe(false);
  });

  it('列見出し「品名」をクリックすると sort=name&order=asc がURLに付与される', async () => {
    renderPage();
    await waitFor(() => expect(requestedUrls.length).toBeGreaterThan(0));

    fireEvent.click(await screen.findByText('品名'));

    await waitFor(() => {
      const last = new URL(requestedUrls[requestedUrls.length - 1], 'http://localhost');
      expect(last.searchParams.get('sort')).toBe('name');
      expect(last.searchParams.get('order')).toBe('asc');
      expect(last.searchParams.get('page')).toBe('1');
    });
  });

  it('列見出し「製造原価」をクリックすると sort=total_cost&order=asc がURLに付与される', async () => {
    renderPage();
    await waitFor(() => expect(requestedUrls.length).toBeGreaterThan(0));

    fireEvent.click(await screen.findByText('製造原価'));

    await waitFor(() => {
      const last = new URL(requestedUrls[requestedUrls.length - 1], 'http://localhost');
      expect(last.searchParams.get('sort')).toBe('total_cost');
      expect(last.searchParams.get('order')).toBe('asc');
    });
  });
});
