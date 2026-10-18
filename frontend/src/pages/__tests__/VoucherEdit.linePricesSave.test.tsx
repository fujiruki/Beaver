import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import VoucherEdit from '../VoucherEdit';
import { AppSettingsProvider } from '../../contexts/AppSettingsContext';

const baseLine = {
  id: 51, voucher_id: 5, line_no: 1, line_type: 'normal', location_no: null, location_name: null,
  tategu_item_id: 5582, source_catalog_item_id: null, item_name: '既存明細', quantity: 1,
  cost_body: 0, cost_hardware: 0, cost_glass: 0, cost_factory_hours: 0, cost_site_hours: 0,
  cost_labor_rate: 5000, snapshot_loaded_at: null, price_body: 0, price_hardware: 0, price_glass: 0,
  line_total: 0, tax_category: 'taxable', memo: null, costs: [], prices: [],
};

const priced = (code: string, name: string, value: number, sort: number) =>
  ({ category_code: code, category_name: name, measure_type: 'money', value, sort_order: sort });

const baseVoucher = {
  id: 5, voucher_no: 'E03981', voucher_type: 'estimate', status: 'draft', project_id: null, customer_id: 1,
  voucher_date: '2026-10-10', delivery_date: null, tax_input_type: 'exclusive', consumption_tax_type: '外税/伝票計',
  override_billing_date: null, trade_type: '掛売上', description: null, profit_rate: 0.3, memo: null,
  sales_category_id: null, validity_period: null, subtotal_taxable: 0, tax_amount: 0, total_amount: 0,
  updated_at: '2026-10-10 09:00:00', lines: [baseLine], converted_sales: [], access_voucher_id: null,
  access_billed_flag: 0, access_billing_date: null, last_synced_at: null, sync_pending: 0,
};

type RequestRecord = { url: string; method: string; body: any };
const requests: RequestRecord[] = [];

function stubFetch() {
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    requests.push({ url, method, body });
    if (url.endsWith('/customers')) return new Response(JSON.stringify([{ id: 1, name: '得意先A' }]));
    if (url.endsWith('/aggregation-categories')) return new Response(JSON.stringify([
      { id: 1, code: 'MAIN', name: '本体', measure_type: 'money', sort_order: 1 },
      { id: 2, code: 'HARDWARE', name: '金物', measure_type: 'money', sort_order: 2 },
      { id: 3, code: 'GLASS', name: 'ガラス', measure_type: 'money', sort_order: 3 },
      { id: 4, code: 'SITE_TIME', name: '現場時間', measure_type: 'time', sort_order: 5 },
    ]));
    if (url.endsWith('/projects') || url.endsWith('/sales-categories')) return new Response('[]');
    if (method === 'PUT' && /\/vouchers\/5\/lines\/\d+$/.test(url)) {
      return new Response(JSON.stringify({ ...baseLine, ...body, voucher_updated_at: '2026-10-10 09:00:02' }));
    }
    if (url.endsWith('/vouchers/5')) return new Response(JSON.stringify(baseVoucher));
    return new Response('{}');
  }));
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const router = createMemoryRouter([
    { path: '/vouchers/:id', element: <VoucherEdit /> },
    { path: '/vouchers', element: <div>伝票一覧</div> },
  ], { initialEntries: ['/vouchers/5'] });
  render(
    <QueryClientProvider client={client}>
      <AppSettingsProvider><RouterProvider router={router} /></AppSettingsProvider>
    </QueryClientProvider>,
  );
}

const linePuts = () => requests.filter(r => r.method === 'PUT' && r.url.endsWith('/vouchers/5/lines/51'));

beforeEach(() => {
  localStorage.clear();
  requests.length = 0;
  vi.stubGlobal('confirm', vi.fn(() => false));
});

describe('明細の売値の内訳を入力してフォーカスを外すと、入力した内訳と再計算後の金額で保存する', () => {
  it('本体・金物・ガラスを順に入力すると、最後の保存に3つの内訳と金額が入る', async () => {
    const user = userEvent.setup();
    stubFetch();
    renderPage();
    await screen.findByText('Beaver作成');
    await screen.findAllByPlaceholderText('本体');
    const price = (name: string) => document.querySelectorAll(`input[placeholder="${name}"]`)[0] as HTMLInputElement;
    await user.clear(price('本体'));
    await user.type(price('本体'), '35700');
    await user.clear(price('金物'));
    await user.type(price('金物'), '2900');
    await user.clear(price('ガラス'));
    await user.type(price('ガラス'), '4300');
    await user.tab();
    await waitFor(() => expect(linePuts().length).toBeGreaterThan(0));
    await new Promise(r => setTimeout(r, 100));
    const last = linePuts().at(-1)!.body;
    expect(last.prices.map((p: any) => [p.category_code, p.value])).toEqual([['MAIN', 35700], ['HARDWARE', 2900], ['GLASS', 4300]]);
    expect(last.line_total).toBe(42900);
  });

  it('既に内訳がある行の本体を入れ直しても、他の内訳を保ったまま再計算後の金額で保存する', async () => {
    const user = userEvent.setup();
    stubFetch();
    baseLine.prices = [priced('MAIN', '本体', 10000, 1), priced('HARDWARE', '金物', 2900, 2), priced('GLASS', 'ガラス', 4300, 3)] as any;
    baseLine.line_total = 17200;
    renderPage();
    await screen.findByText('Beaver作成');
    await screen.findAllByPlaceholderText('本体');
    const main = document.querySelectorAll('input[placeholder="本体"]')[0] as HTMLInputElement;
    await user.clear(main);
    await user.type(main, '35700');
    await user.tab();
    await waitFor(() => expect(linePuts().length).toBeGreaterThan(0));
    await new Promise(r => setTimeout(r, 100));
    const last = linePuts().at(-1)!.body;
    expect(last.prices.map((p: any) => [p.category_code, p.value])).toEqual([['MAIN', 35700], ['HARDWARE', 2900], ['GLASS', 4300]]);
    expect(last.line_total).toBe(42900);
  });

  it('原価を入れたあと「原価から売値を設定」を押すと、設定された売値と金額も保存する', async () => {
    const user = userEvent.setup();
    stubFetch();
    baseLine.prices = [priced('MAIN', '本体', 0, 1), priced('HARDWARE', '金物', 0, 2)] as any;
    baseLine.line_total = 0;
    renderPage();
    await screen.findByText('Beaver作成');
    await screen.findAllByPlaceholderText('本体');
    for (const [name, v] of [['本体', '5000'], ['金物', '2000'], ['ガラス', '3000']]) {
      const costInput = document.querySelectorAll(`input[placeholder="${name}"]`)[1] as HTMLInputElement;
      await user.clear(costInput);
      await user.type(costInput, v);
      await user.tab();
    }
    await user.click(document.querySelector('input[type="radio"]') as HTMLInputElement);
    await user.click(screen.getByRole('button', { name: '原価から売値を設定' }));
    await waitFor(() => {
      const last = linePuts().at(-1)!.body;
      expect(last.prices.length).toBe(3);
      expect(last.line_total).toBeGreaterThan(0);
    });
  });
});
