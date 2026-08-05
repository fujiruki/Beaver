import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import VoucherList from '../VoucherList';

const CUSTOMERS = [
  { id: 1, name: '田中商店', name_kana: null, tel: '090-1111-2222', mobile: null, address1: null, address2: null, memo: null },
  { id: 2, name: '鈴木製作所', name_kana: null, tel: '06-3333-4444', mobile: null, address1: null, address2: null, memo: null },
];

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.includes('/customers')) {
      return new Response(JSON.stringify(CUSTOMERS), { status: 200 });
    }
    if (url.includes('/projects')) {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    return new Response(JSON.stringify({
      data: [],
      meta: { total: 0, page: 1, per_page: 50, last_page: 1 },
    }), { status: 200 });
  }));
});

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <VoucherList />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('VoucherList 得意先ComboSelectの検索対象拡張 (R-0083)', () => {
  it('得意先の電話番号で検索すると、名前が違っても候補に出る', async () => {
    renderPage();
    const [customerInput] = await screen.findAllByPlaceholderText('すべて') as HTMLInputElement[];

    fireEvent.focus(customerInput);
    await waitFor(() => expect(screen.getByText('田中商店')).not.toBe(null));

    fireEvent.change(customerInput, { target: { value: '3333-4444' } });

    await waitFor(() => expect(screen.getByText('鈴木製作所')).not.toBe(null));
    expect(screen.queryByText('田中商店')).toBe(null);
  });
});
