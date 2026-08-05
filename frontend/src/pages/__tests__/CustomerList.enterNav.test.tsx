import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import CustomerList from '../CustomerList';

const ALL_CUSTOMERS = [
  { id: 1, code: '1', name: '田中商店', tel: null, address1: null, address2: null },
  { id: 2, code: '2', name: '鈴木製作所', tel: null, address1: null, address2: null },
];

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const u = new URL(url, 'http://localhost');
    const q = u.searchParams.get('q') ?? '';
    const data = q ? ALL_CUSTOMERS.filter(c => c.name.includes(q)) : ALL_CUSTOMERS;
    return new Response(JSON.stringify({
      data,
      meta: { total: data.length, page: 1, per_page: 50, last_page: 1 },
    }), { status: 200 });
  }));
});

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/customers']}>
        <Routes>
          <Route path="/customers" element={<CustomerList />} />
          <Route path="/customers/:id" element={<div>得意先詳細画面</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('CustomerList 検索結果1件時のEnter遷移 (R-0083)', () => {
  it('検索結果が1件に絞られた状態でEnterを押すと詳細画面へ遷移する', async () => {
    renderPage();
    const input = await screen.findByPlaceholderText('得意先名・コードで検索') as HTMLInputElement;

    fireEvent.change(input, { target: { value: '鈴木製作所' } });
    await waitFor(() => expect(screen.queryByText('田中商店')).toBe(null));

    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(screen.getByText('得意先詳細画面')).not.toBe(null));
  });

  it('検索結果が複数件のままEnterを押しても遷移しない', async () => {
    renderPage();
    const input = await screen.findByPlaceholderText('得意先名・コードで検索') as HTMLInputElement;
    await waitFor(() => expect(screen.getAllByText(/田中商店|鈴木製作所/).length).toBe(2));

    fireEvent.keyDown(input, { key: 'Enter' });

    expect(screen.queryByText('得意先詳細画面')).toBe(null);
  });
});
