import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import CustomerList from '../CustomerList';

const ALL_CUSTOMERS = [
  { id: 1, code: '1', name: '田中商店', tel: null, address1: null, address2: null },
  { id: 2, code: '2', name: '鈴木製作所', tel: null, address1: null, address2: null },
];

let requestedUrls: string[] = [];

beforeEach(() => {
  localStorage.clear();
  requestedUrls = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    requestedUrls.push(url);
    return new Response(JSON.stringify({
      data: ALL_CUSTOMERS,
      meta: { total: ALL_CUSTOMERS.length, page: 1, per_page: 50, last_page: 1 },
    }), { status: 200 });
  }));
});

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <CustomerList />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('CustomerList サーバソート (R-076 Part A Phase 1)', () => {
  it('初回表示時は sort/order パラメータを付けない', async () => {
    renderPage();
    await waitFor(() => expect(requestedUrls.length).toBeGreaterThan(0));
    const first = new URL(requestedUrls[0], 'http://localhost');
    expect(first.searchParams.has('sort')).toBe(false);
    expect(first.searchParams.has('order')).toBe(false);
  });

  it('列見出し「得意先名」をクリックすると sort=name&order=asc がURLに付与される', async () => {
    renderPage();
    await waitFor(() => expect(requestedUrls.length).toBeGreaterThan(0));

    fireEvent.click(await screen.findByText('得意先名'));

    await waitFor(() => {
      const last = new URL(requestedUrls[requestedUrls.length - 1], 'http://localhost');
      expect(last.searchParams.get('sort')).toBe('name');
      expect(last.searchParams.get('order')).toBe('asc');
    });
  });

  it('同じ列見出しを再クリックすると order が desc に反転する', async () => {
    renderPage();
    await waitFor(() => expect(requestedUrls.length).toBeGreaterThan(0));

    fireEvent.click(await screen.findByText('得意先名'));
    await waitFor(() => {
      const last = new URL(requestedUrls[requestedUrls.length - 1], 'http://localhost');
      expect(last.searchParams.get('order')).toBe('asc');
    });

    fireEvent.click(await screen.findByText('得意先名'));
    await waitFor(() => {
      const last = new URL(requestedUrls[requestedUrls.length - 1], 'http://localhost');
      expect(last.searchParams.get('sort')).toBe('name');
      expect(last.searchParams.get('order')).toBe('desc');
    });
  });

  it('ソート変更時に page=1 でリクエストされる', async () => {
    renderPage();
    await waitFor(() => expect(requestedUrls.length).toBeGreaterThan(0));

    fireEvent.click(await screen.findByText('得意先名'));

    await waitFor(() => {
      const last = new URL(requestedUrls[requestedUrls.length - 1], 'http://localhost');
      expect(last.searchParams.get('page')).toBe('1');
    });
  });
});
