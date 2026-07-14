import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import VoucherList from '../VoucherList';

const ALL_VOUCHERS = [
  { id: 1, voucher_no: 'E00001', voucher_type: 'estimate', status: 'draft', customer_id: 1,
    customer_name: '田中商店', project_name: '田中邸', description: '玄関ドア', voucher_date: '2026-01-01', total_amount: 100000 },
  { id: 2, voucher_no: 'S00001', voucher_type: 'sales', status: 'billed', customer_id: 2,
    customer_name: '鈴木製作所', project_name: '鈴木邸', description: '窓サッシ', voucher_date: '2026-02-01', total_amount: 200000 },
];

let requestedUrls: string[] = [];

beforeEach(() => {
  localStorage.clear();
  requestedUrls = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const u = new URL(url, 'http://localhost');
    // 得意先/案件フィルタ用の全件取得は空配列で応答
    if (u.pathname.endsWith('/customers') || u.pathname.endsWith('/projects')) {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    requestedUrls.push(url);
    return new Response(JSON.stringify({
      data: ALL_VOUCHERS,
      meta: { total: ALL_VOUCHERS.length, page: 1, per_page: 50, last_page: 1 },
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

describe('VoucherList サーバソート (R-076 Part A)', () => {
  it('初回表示時は sort/order パラメータを付けない', async () => {
    renderPage();
    await waitFor(() => expect(requestedUrls.length).toBeGreaterThan(0));
    const first = new URL(requestedUrls[0], 'http://localhost');
    expect(first.searchParams.has('sort')).toBe(false);
    expect(first.searchParams.has('order')).toBe(false);
  });

  it('列見出し「得意先」をクリックすると sort=customer_name&order=asc がURLに付与される', async () => {
    renderPage();
    await waitFor(() => expect(requestedUrls.length).toBeGreaterThan(0));

    // フィルタのラベルとも重複するため列見出し（columnheader）を明示して選択する
    fireEvent.click(await screen.findByRole('columnheader', { name: '得意先' }));

    await waitFor(() => {
      const last = new URL(requestedUrls[requestedUrls.length - 1], 'http://localhost');
      expect(last.searchParams.get('sort')).toBe('customer_name');
      expect(last.searchParams.get('order')).toBe('asc');
      expect(last.searchParams.get('page')).toBe('1');
    });
  });

  it('同じ列見出しを再クリックすると order が desc に反転する', async () => {
    renderPage();
    await waitFor(() => expect(requestedUrls.length).toBeGreaterThan(0));

    fireEvent.click(await screen.findByText('合計金額'));
    await waitFor(() => {
      const last = new URL(requestedUrls[requestedUrls.length - 1], 'http://localhost');
      expect(last.searchParams.get('sort')).toBe('total_amount');
      expect(last.searchParams.get('order')).toBe('asc');
    });

    fireEvent.click(await screen.findByText('合計金額'));
    await waitFor(() => {
      const last = new URL(requestedUrls[requestedUrls.length - 1], 'http://localhost');
      expect(last.searchParams.get('sort')).toBe('total_amount');
      expect(last.searchParams.get('order')).toBe('desc');
    });
  });
});
