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
      meta: { total: ALL_CUSTOMERS.length, page: 1, per_page: 50, last_page: 2 },
    }), { status: 200 });
  }));
});

function renderPage(initialEntries?: string[]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={initialEntries ?? ['/customers']}>
        <CustomerList />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('CustomerList URL状態保持 (R-0096 Phase1)', () => {
  it('検索語を入力すると検索APIリクエストのqパラメータに反映される', async () => {
    renderPage();
    await waitFor(() => expect(requestedUrls.length).toBeGreaterThan(0));
    const input = await screen.findByPlaceholderText('得意先名・コードで検索');
    fireEvent.change(input, { target: { value: 'たなか' } });

    await waitFor(() => {
      const last = new URL(requestedUrls[requestedUrls.length - 1], 'http://localhost');
      expect(last.searchParams.get('q')).toBe('たなか');
    });
  });

  it('URLにq/sort/order/pageが既に入っている状態から表示すると、その状態が復元される', async () => {
    renderPage(['/customers?q=%E7%94%B0%E4%B8%AD&sort=name&order=desc&page=1']);
    await waitFor(() => expect(requestedUrls.length).toBeGreaterThan(0));

    const input = await screen.findByPlaceholderText('得意先名・コードで検索') as HTMLInputElement;
    expect(input.value).toBe('田中');

    const last = new URL(requestedUrls[requestedUrls.length - 1], 'http://localhost');
    expect(last.searchParams.get('sort')).toBe('name');
    expect(last.searchParams.get('order')).toBe('desc');
    expect(last.searchParams.get('q')).toBe('田中');
  });

  it('列見出しクリックでソートするとURLのsort/orderが更新される', async () => {
    renderPage();
    await waitFor(() => expect(requestedUrls.length).toBeGreaterThan(0));

    fireEvent.click(await screen.findByText('得意先名'));

    await waitFor(() => {
      const last = new URL(requestedUrls[requestedUrls.length - 1], 'http://localhost');
      expect(last.searchParams.get('sort')).toBe('name');
      expect(last.searchParams.get('order')).toBe('asc');
    });
  });
});
