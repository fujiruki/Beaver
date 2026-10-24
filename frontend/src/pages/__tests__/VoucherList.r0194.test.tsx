import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import VoucherList from '../VoucherList';

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const path = new URL(url, 'http://localhost').pathname;
    if (path.endsWith('/customers') || path.endsWith('/projects')) return new Response('[]');
    return new Response(JSON.stringify({ data: [], meta: { total: 0, page: 1, per_page: 50, last_page: 1 } }));
  }));
});

function renderList(entry: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entry]}>
        <VoucherList />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('R-0194 伝票一覧の日付列名', () => {
  it.each([
    ['/vouchers?voucher_type=estimate', '見積日'],
    ['/vouchers?voucher_type=sales', '売上日'],
    ['/vouchers', '伝票日付'],
  ])('%sでは「%s」と表示する', async (entry, label) => {
    renderList(entry);
    expect(await screen.findByRole('columnheader', { name: label })).toBeTruthy();
  });
});
