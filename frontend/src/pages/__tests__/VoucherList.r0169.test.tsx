import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import VoucherList from '../VoucherList';

let requestedUrls: string[] = [];

beforeEach(() => {
  localStorage.clear();
  requestedUrls = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const u = new URL(url, 'http://localhost');
    if (u.pathname.endsWith('/customers') || u.pathname.endsWith('/projects')) return new Response('[]');
    requestedUrls.push(url);
    return new Response(JSON.stringify({ data: [], meta: { total: 0, page: 1, per_page: 50, last_page: 1 } }));
  }));
});

function SalesTab() {
  const navigate = useNavigate();
  return <button type="button" onClick={() => navigate('/vouchers?voucher_type=sales')}>売上タブ</button>;
}

const lastType = () => new URL(requestedUrls[requestedUrls.length - 1], 'http://localhost').searchParams.get('voucher_type');

describe('R-0169: メニューの見積/売上から一覧の種別フィルタを切り替える', () => {
  it('見積の一覧を開いたまま「売上」に移ると売上で絞り込む', async () => {
    const user = userEvent.setup();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/vouchers?voucher_type=estimate']}>
          <SalesTab />
          <VoucherList />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(lastType()).toBe('estimate'));
    await user.click(screen.getByRole('button', { name: '売上タブ' }));
    await waitFor(() => expect(lastType()).toBe('sales'));
  });
});
