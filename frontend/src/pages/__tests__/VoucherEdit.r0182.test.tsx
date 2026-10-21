import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import VoucherEdit from '../VoucherEdit';
import CustomerDetail from '../CustomerDetail';
import { AppSettingsProvider } from '../../contexts/AppSettingsContext';

const baseVoucher = {
  id: 5, voucher_no: 'S-00005', voucher_type: 'sales', status: 'draft', project_id: null, customer_id: 1,
  voucher_date: '2026-10-10', delivery_date: null, tax_input_type: 'exclusive', consumption_tax_type: '外税/伝票計',
  override_billing_date: null, trade_type: '掛売上', description: '変更前', profit_rate: 0.3, memo: null,
  sales_category_id: null, validity_period: null, subtotal_taxable: 0, tax_amount: 0, total_amount: 0,
  updated_at: '2026-10-10 09:00:00', lines: [], converted_sales: [], access_voucher_id: null,
  access_billed_flag: 0, access_billing_date: null, last_synced_at: null, sync_pending: 0,
};

type WriteResult = 'success' | 'not-found' | 'error' | 'stale';
const requests: Array<{ url: string; method: string }> = [];

function stubVoucherFetch({ getNotFound = false, writeResult = 'success' as WriteResult } = {}) {
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    requests.push({ url, method });
    if (url.endsWith('/customers')) return new Response(JSON.stringify([{ id: 1, name: '得意先A' }]));
    if (url.endsWith('/projects') || url.endsWith('/aggregation-categories') || url.endsWith('/sales-categories')) {
      return new Response('[]');
    }
    if (url.endsWith('/vouchers/5') && method === 'GET') {
      return getNotFound
        ? new Response(JSON.stringify({ error: 'not found' }), { status: 404 })
        : new Response(JSON.stringify(baseVoucher));
    }
    if (url.endsWith('/vouchers/5') && method === 'PUT') {
      if (writeResult === 'not-found') return new Response(JSON.stringify({ error: 'not found' }), { status: 404 });
      if (writeResult === 'error') return new Response(JSON.stringify({ error: '一時的な障害' }), { status: 500 });
      if (writeResult === 'stale') return new Response(JSON.stringify({
        error: 'stale_voucher', voucher: { ...baseVoucher, updated_at: '2026-10-10 10:00:00' },
      }), { status: 409 });
      return new Response(JSON.stringify({ ...baseVoucher, description: '編集後' }));
    }
    return new Response('{}');
  }));
}

function createClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

function renderVoucher(client = createClient()) {
  const router = createMemoryRouter([
    { path: '/vouchers/:id', element: <VoucherEdit /> },
    { path: '/vouchers', element: <div>伝票一覧</div> },
  ], { initialEntries: ['/vouchers/5'] });
  render(
    <QueryClientProvider client={client}>
      <AppSettingsProvider><RouterProvider router={router} /></AppSettingsProvider>
    </QueryClientProvider>,
  );
  return router;
}

async function editDescription() {
  const user = userEvent.setup();
  await screen.findByDisplayValue('2026-10-10');
  const description = document.querySelector('input[name="description"]') as HTMLInputElement;
  await user.clear(description);
  await user.type(description, '編集後');
  await user.tab();
  return { user, description };
}

beforeEach(() => {
  localStorage.clear();
  requests.length = 0;
  vi.stubGlobal('confirm', vi.fn(() => false));
});

describe('R-0182 存在しない伝票と保存・閉じるループ', () => {
  it('GETが404ならキャッシュがあっても案内だけを表示し、フォームと保存操作を出さない', async () => {
    stubVoucherFetch({ getNotFound: true });
    const client = createClient();
    client.setQueryData(['vouchers', 5], baseVoucher);
    renderVoucher(client);

    expect(await screen.findByText('この伝票は見つかりません（削除されたか、データが入れ替わりました）')).toBeTruthy();
    expect(screen.getByRole('link', { name: '伝票一覧へ' })).toBeTruthy();
    expect(document.querySelector('form')).toBeNull();
    expect(screen.queryByRole('button', { name: '保存' })).toBeNull();
    expect(requests.some(request => request.method === 'PUT')).toBe(false);
  });

  it('編集後のPUTが404でも保存済みにせず、閉じると一覧へ移動してループしない', async () => {
    stubVoucherFetch({ writeResult: 'not-found' });
    const router = renderVoucher();
    const { user, description } = await editDescription();

    expect(await screen.findByText('保存に失敗しました: この伝票は見つかりません')).toBeTruthy();
    expect(screen.queryByText(/保存しました \d{2}:\d{2}/)).toBeNull();
    expect(description.value).toBe('編集後');
    await user.click(screen.getByRole('button', { name: '閉じる' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/vouchers'));
    expect(screen.getByText('伝票一覧')).toBeTruthy();
  });

  it('書き込みが404なら再試行を出さず伝票一覧へのリンクを出す', async () => {
    stubVoucherFetch({ writeResult: 'not-found' });
    renderVoucher();
    await editDescription();

    expect(await screen.findByRole('link', { name: '伝票一覧へ' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '再試行' })).toBeNull();
  });

  it('書き込みが500なら従来どおり再試行を出し、閉じても画面に残る', async () => {
    stubVoucherFetch({ writeResult: 'error' });
    const router = renderVoucher();
    const { user } = await editDescription();

    expect(await screen.findByRole('button', { name: '再試行' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '閉じる' }));
    await waitFor(() => expect(requests.filter(request => request.method === 'PUT').length).toBeGreaterThan(1));
    expect(router.state.location.pathname).toBe('/vouchers/5');
  });

  it('stale_voucherなら従来どおり再読み込みを出し、閉じても画面に残る', async () => {
    stubVoucherFetch({ writeResult: 'stale' });
    const router = renderVoucher();
    const { user } = await editDescription();

    expect(await screen.findByRole('button', { name: '再読み込み' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '閉じる' }));
    expect(router.state.location.pathname).toBe('/vouchers/5');
  });
});

describe('R-0182 存在しない得意先', () => {
  it('GETが404なら案内を表示してフォームを出さない', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'not found' }), { status: 404 })));
    const router = createMemoryRouter([
      { path: '/customers/:id', element: <CustomerDetail /> },
      { path: '/customers', element: <div>得意先一覧</div> },
    ], { initialEntries: ['/customers/3'] });
    render(<QueryClientProvider client={createClient()}><RouterProvider router={router} /></QueryClientProvider>);

    expect(await screen.findByText('この得意先は見つかりません')).toBeTruthy();
    expect(screen.getByRole('link', { name: '得意先一覧へ' })).toBeTruthy();
    expect(document.querySelector('form')).toBeNull();
  });
});
