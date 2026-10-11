import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import VoucherEdit from '../VoucherEdit';
import { AppSettingsProvider } from '../../contexts/AppSettingsContext';

const baseVoucher = {
  id: 5,
  voucher_no: 'S-00005',
  voucher_type: 'sales',
  status: 'void',
  project_id: null,
  customer_id: 1,
  voucher_date: '2026-09-01',
  delivery_date: null,
  tax_input_type: 'exclusive',
  consumption_tax_type: '外税/伝票計',
  override_billing_date: null,
  trade_type: '掛売上',
  description: null,
  profit_rate: 0.3,
  memo: null,
  sales_category_id: null,
  validity_period: null,
  subtotal_taxable: 0,
  tax_amount: 0,
  total_amount: 0,
  lines: [],
  converted_sales: [],
  access_voucher_id: null,
  access_billed_flag: 0,
  access_billing_date: null,
  last_synced_at: null,
  sync_pending: 0,
};

const requests: Array<{ url: string; method: string; body: any }> = [];

function stubFetch() {
  let status = 'void';
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    requests.push({ url, method, body });
    if (url.endsWith('/customers')) return new Response(JSON.stringify([{ id: 1, name: '得意先A' }]));
    if (url.endsWith('/projects')) return new Response('[]');
    if (url.endsWith('/aggregation-categories')) return new Response('[]');
    if (url.endsWith('/sales-categories')) return new Response('[]');
    if (url.endsWith('/vouchers/5/unvoid') && method === 'POST') {
      status = 'draft';
      return new Response(JSON.stringify({ result: 'unvoided', voucher_updated_at: '2026-10-11 10:00:00' }));
    }
    if (url.endsWith('/vouchers/5')) return new Response(JSON.stringify({ ...baseVoucher, status, is_empty: false }));
    return new Response('{}');
  }));
}

function renderVoucher() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AppSettingsProvider>
        <MemoryRouter initialEntries={['/vouchers/5']}>
          <Routes>
            <Route path="/vouchers/:id" element={<VoucherEdit />} />
          </Routes>
        </MemoryRouter>
      </AppSettingsProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  requests.length = 0;
  vi.stubGlobal('alert', vi.fn());
});

describe('R-0170: 取消した伝票を下書きに戻す', () => {
  it('void の伝票には取消ボタンの代わりに「下書きに戻す」が出る', async () => {
    stubFetch();
    renderVoucher();
    expect(await screen.findByRole('button', { name: '下書きに戻す' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '取消' })).toBeNull();
  });

  it('確認ダイアログで理由を入れて戻すと API を呼び、下書きとして編集できる状態になる', async () => {
    const user = userEvent.setup();
    stubFetch();
    renderVoucher();
    await user.click(await screen.findByRole('button', { name: '下書きに戻す' }));

    expect(await screen.findByText('この伝票を下書きに戻します。理由（任意）')).toBeTruthy();
    expect(requests.some(r => r.method === 'POST')).toBe(false);
    await user.type(screen.getByRole('textbox', { name: 'この伝票を下書きに戻します。理由（任意）' }), '取消を誤った');
    await user.click(screen.getByRole('button', { name: '戻す' }));

    await waitFor(() => expect(requests.some(r => r.method === 'POST' && r.url.endsWith('/vouchers/5/unvoid'))).toBe(true));
    const post = requests.find(r => r.method === 'POST' && r.url.endsWith('/vouchers/5/unvoid'))!;
    expect(post.body.reason).toBe('取消を誤った');
    expect(await screen.findByRole('button', { name: '取消' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '下書きに戻す' })).toBeNull();
    expect((document.querySelector('input[name="description"]') as HTMLInputElement).readOnly).toBe(false);
  });

  it('やめるを押すと API を呼ばない', async () => {
    const user = userEvent.setup();
    stubFetch();
    renderVoucher();
    await user.click(await screen.findByRole('button', { name: '下書きに戻す' }));
    await user.click(await screen.findByRole('button', { name: 'やめる' }));
    expect(screen.queryByText('この伝票を下書きに戻します。理由（任意）')).toBeNull();
    expect(requests.some(r => r.method === 'POST')).toBe(false);
  });
});
