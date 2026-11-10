import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import VoucherEdit from '../VoucherEdit';
import { AppSettingsProvider } from '../../contexts/AppSettingsContext';
import { APP_STORAGE_PREFIX } from '../../lib/appId';

const categories = [
  { id: 1, code: 'MAIN', name: '本体', measure_type: 'money', sort_order: 1 },
  { id: 2, code: 'HARDWARE', name: '金物', measure_type: 'money', sort_order: 2 },
  { id: 3, code: 'GLASS', name: 'ガラス', measure_type: 'money', sort_order: 3 },
  { id: 4, code: 'FACTORY_TIME', name: '工場時間', measure_type: 'time', sort_order: 4 },
  { id: 5, code: 'SITE_TIME', name: '現場時間', measure_type: 'time', sort_order: 5 },
];

const line = {
  id: 51, voucher_id: 5, line_no: 1, line_type: 'normal', location_no: null, location_name: '玄関',
  tategu_item_id: null, source_catalog_item_id: null, item_name: '取付建具', quantity: 3,
  cost_body: 0, cost_hardware: 0, cost_glass: 0, cost_factory_hours: 0, cost_site_hours: 0,
  cost_labor_rate: 7600, snapshot_loaded_at: null, price_body: 0, price_hardware: 0, price_glass: 0,
  line_total: 79800, tax_category: 'taxable', memo: null,
  prices: [
    { category_code: 'MAIN', category_name: '本体', measure_type: 'money', value: 26000, sort_order: 1 },
    { category_code: 'HARDWARE', category_name: '金物', measure_type: 'money', value: 400, sort_order: 2 },
    { category_code: 'GLASS', category_name: 'ガラス', measure_type: 'money', value: 200, sort_order: 3 },
  ],
  costs: [
    { category_code: 'MAIN', category_name: '本体', measure_type: 'money', value: 400, sort_order: 1 },
    { category_code: 'HARDWARE', category_name: '金物', measure_type: 'money', value: 0, sort_order: 2 },
    { category_code: 'GLASS', category_name: 'ガラス', measure_type: 'money', value: 0, sort_order: 3 },
    { category_code: 'FACTORY_TIME', category_name: '工場h', measure_type: 'time', value: 4, sort_order: 4 },
    { category_code: 'SITE_TIME', category_name: '現場h', measure_type: 'time', value: 2, sort_order: 5 },
  ],
};

const voucher = {
  id: 5, voucher_no: 'E03981', voucher_type: 'estimate', status: 'draft', project_id: null, customer_id: 1,
  voucher_date: '2026-10-10', delivery_date: null, tax_input_type: 'exclusive', consumption_tax_type: '外税/伝票計',
  override_billing_date: null, trade_type: '掛売上', description: null, profit_rate: 0.3, memo: null,
  sales_category_id: null, validity_period: null, subtotal_taxable: 79800, tax_amount: 7980, total_amount: 87780,
  updated_at: '2026-10-10 09:00:00', lines: [line, { ...line, id: 52, line_no: 2 }], converted_sales: [],
  access_voucher_id: null, access_billed_flag: 0, access_billing_date: null, last_synced_at: null, sync_pending: 0,
};

function stubFetch() {
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith('/customers')) return new Response(JSON.stringify([{ id: 1, name: '得意先A' }]));
    if (url.endsWith('/aggregation-categories')) return new Response(JSON.stringify(categories));
    if (url.endsWith('/projects') || url.endsWith('/sales-categories')) return new Response('[]');
    if (url.endsWith('/vouchers/5')) return new Response(JSON.stringify(voucher));
    return new Response('{}');
  }));
}

function renderPage(hoursPerDay: number) {
  localStorage.setItem(`${APP_STORAGE_PREFIX}app_settings`, JSON.stringify({ hoursPerDay }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const router = createMemoryRouter([
    { path: '/vouchers/:id', element: <VoucherEdit /> },
  ], { initialEntries: ['/vouchers/5'] });
  return render(
    <QueryClientProvider client={client}>
      <AppSettingsProvider><RouterProvider router={router} /></AppSettingsProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  stubFetch();
});

describe('R-0261 サマリーの時間に日数も出す', () => {
  it('1日8時間なら、時間の横に日数が出る', async () => {
    renderPage(8);
    const summary = await screen.findByTestId('top-summary');
    expect(within(summary).getByText('工場時間').nextSibling?.textContent).toBe('24 h（3.0日）');
    expect(within(summary).getByText('現場時間').nextSibling?.textContent).toBe('12 h（1.5日）');
    expect(within(summary).getByText('合計時間').nextSibling?.textContent).toBe('36 h（4.5日）');
  });

  it('日数は小数第1位で四捨五入する', async () => {
    renderPage(7);
    const summary = await screen.findByTestId('top-summary');
    expect(within(summary).getByText('合計時間').nextSibling?.textContent).toBe('36 h（5.1日）');
  });

  it('1日の作業時間が0なら日数は出さない', async () => {
    renderPage(0);
    const summary = await screen.findByTestId('top-summary');
    expect(within(summary).getByText('合計時間').nextSibling?.textContent).toBe('36 h');
    expect(summary.textContent).not.toContain('日）');
  });
});
