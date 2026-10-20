import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import VoucherEdit from '../VoucherEdit';
import { AppSettingsProvider } from '../../contexts/AppSettingsContext';

const voucher = {
  id: 5, voucher_no: 'E00005', voucher_type: 'estimate', status: 'draft', project_id: null, customer_id: 1,
  voucher_date: '2026-10-20', delivery_date: null, tax_input_type: 'exclusive', consumption_tax_type: '外税/伝票計',
  override_billing_date: null, trade_type: '掛売上', description: null, profit_rate: 0.3, memo: null,
  sales_category_id: null, validity_period: null, subtotal_taxable: 0, tax_amount: 0, total_amount: 0,
  updated_at: '2026-10-20 09:00:00', lines: [], converted_sales: [], access_voucher_id: null,
  access_billed_flag: 0, access_billing_date: null, last_synced_at: null, sync_pending: 0,
};

const requests: Array<{ url: string; method: string; body: any }> = [];

function stubFetch() {
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    requests.push({ url, method, body });
    if (url.endsWith('/customers')) return new Response(JSON.stringify([{ id: 1, name: '得意先A' }]));
    if (url.endsWith('/projects') || url.endsWith('/aggregation-categories')) return new Response('[]');
    if (url.endsWith('/sales-categories')) {
      return new Response(JSON.stringify([{ id: 1, name: '1地元建具', sort_order: 1, is_active: 1 }]));
    }
    if (url.endsWith('/vouchers/5') && method === 'GET') return new Response(JSON.stringify(voucher));
    if (url.endsWith('/vouchers/5') && method === 'PUT') return new Response(JSON.stringify({ ...voucher, ...body }));
    if (url.endsWith('/vouchers') && method === 'POST') return new Response(JSON.stringify({ id: 77 }), { status: 201 });
    if (url.endsWith('/vouchers/77/lines') && method === 'POST') return new Response(JSON.stringify({ id: 88 }), { status: 201 });
    return new Response('{}');
  }));
}

function renderPage(entry: '/vouchers/new' | '/vouchers/5') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AppSettingsProvider>
        <MemoryRouter initialEntries={[entry]}>
          <Routes>
            <Route path="/vouchers/new" element={<VoucherEdit />} />
            <Route path="/vouchers/:id" element={<VoucherEdit />} />
          </Routes>
        </MemoryRouter>
      </AppSettingsProvider>
    </QueryClientProvider>,
  );
}

function salesCategorySelect() {
  return document.querySelector('select[name="sales_category_id"]') as HTMLSelectElement;
}

async function prepareNewVoucher() {
  const user = userEvent.setup();
  renderPage('/vouchers/new');
  await screen.findByText('1地元建具');
  await user.selectOptions(document.querySelector('select[name="customer_id"]') as HTMLSelectElement, '1');
  return user;
}

beforeEach(() => {
  localStorage.clear();
  requests.length = 0;
  stubFetch();
});

describe('R-0188 新規伝票の売上種別初期値', () => {
  it('新規作成画面の売上種別は「1地元建具」である', async () => {
    renderPage('/vouchers/new');
    await screen.findByText('1地元建具');

    expect(salesCategorySelect().value).toBe('1');
  });

  it('初期値のまま保存するとsales_category_idが1で送られる', async () => {
    const user = await prepareNewVoucher();

    await user.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => expect(requests.some(request => request.method === 'POST' && request.url.endsWith('/vouchers'))).toBe(true));
    const post = requests.find(request => request.method === 'POST' && request.url.endsWith('/vouchers'));
    expect(post?.body.sales_category_id).toBe(1);
  });

  it('未設定に戻して保存するとsales_category_idがnullで送られる', async () => {
    const user = await prepareNewVoucher();
    await user.selectOptions(salesCategorySelect(), '');

    await user.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => expect(requests.some(request => request.method === 'POST' && request.url.endsWith('/vouchers'))).toBe(true));
    const post = requests.find(request => request.method === 'POST' && request.url.endsWith('/vouchers'));
    expect(post?.body.sales_category_id).toBeNull();
  });

  it('売上種別が未設定の既存伝票は未設定のまま表示され、保存しても1にならない', async () => {
    const user = userEvent.setup();
    renderPage('/vouchers/5');
    await screen.findByText('1地元建具');
    await waitFor(() => expect(salesCategorySelect().value).toBe(''));

    await user.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => expect(requests.some(request => request.method === 'PUT' && request.url.endsWith('/vouchers/5'))).toBe(true));
    const puts = requests.filter(request => request.method === 'PUT' && request.url.endsWith('/vouchers/5'));
    expect(puts.at(-1)?.body.sales_category_id).toBeNull();
  });
});
