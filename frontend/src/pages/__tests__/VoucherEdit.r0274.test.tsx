import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import VoucherEdit from '../VoucherEdit';
import { AppSettingsProvider } from '../../contexts/AppSettingsContext';

const categories = [
  { id: 1, code: 'MAIN', name: '本体', measure_type: 'money', sort_order: 1 },
  { id: 4, code: 'FACTORY_TIME', name: '工場時間', measure_type: 'time', sort_order: 4 },
  { id: 5, code: 'SITE_TIME', name: '現場時間', measure_type: 'time', sort_order: 5 },
];

const line = {
  id: 51, voucher_id: 5, line_no: 1, line_type: 'normal', location_no: null, location_name: '玄関',
  tategu_item_id: null, source_catalog_item_id: null, item_name: '取付建具', quantity: 3,
  cost_body: 0, cost_hardware: 0, cost_glass: 0, cost_factory_hours: 0, cost_site_hours: 0,
  cost_labor_rate: 7600, snapshot_loaded_at: null, price_body: 0, price_hardware: 0, price_glass: 0,
  line_total: 78000, tax_category: 'taxable', memo: null,
  prices: [{ category_code: 'MAIN', category_name: '本体', measure_type: 'money', value: 26000, sort_order: 1 }],
  costs: [{ category_code: 'MAIN', category_name: '本体', measure_type: 'money', value: 400, sort_order: 1 }],
};

const voucher = {
  id: 5, voucher_no: 'E03981', voucher_type: 'estimate', status: 'draft', project_id: null, customer_id: 1,
  voucher_date: '2026-10-10', delivery_date: null, tax_input_type: 'exclusive', consumption_tax_type: '外税/伝票計',
  override_billing_date: null, trade_type: '掛売上', description: null, profit_rate: 0.3, memo: null,
  sales_category_id: null, validity_period: null, subtotal_taxable: 156000, tax_amount: 15600, total_amount: 171600,
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

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const router = createMemoryRouter([{ path: '/vouchers/:id', element: <VoucherEdit /> }], { initialEntries: ['/vouchers/5'] });
  return render(
    <QueryClientProvider client={client}>
      <AppSettingsProvider><RouterProvider router={router} /></AppSettingsProvider>
    </QueryClientProvider>,
  );
}

const ready = async () => {
  const summary = await screen.findByTestId('top-summary');
  await screen.findByTestId('line-item-0');
  return summary;
};

beforeEach(() => { localStorage.clear(); stubFetch(); });

describe('R-0274 サマリーの税抜と税込', () => {
  const originalWidth = window.innerWidth;
  afterEach(() => { window.innerWidth = originalWidth; });

  for (const width of [1280, 1920]) {
    it(`${width}px: 売上（税抜）と売上（税込）の両方の金額が出る`, async () => {
      window.innerWidth = width;
      renderPage();
      const summary = await ready();
      await waitFor(() => expect(summary.textContent).toContain('¥156,000'));
      expect(summary.textContent).toContain('売上（税抜）');
      expect(summary.textContent).toContain('売上（税込）');
      expect(summary.textContent).toContain('¥171,600');
    });
  }

  it('1280px: 上に置いたとき、見出しと値が同じまとまりの中にあり、横に詰めて折り返す', async () => {
    window.innerWidth = 1280;
    renderPage();
    const summary = await ready();
    expect(summary.style.display).toBe('flex');
    expect(summary.style.flexWrap).toBe('wrap');
    await waitFor(() => expect(summary.textContent).toContain('¥156,000'));
    const items = within(summary).getAllByTestId('top-summary-item');
    const labels = items.map(i => i.firstElementChild?.textContent);
    expect(labels.slice(0, 8)).toEqual(['売上（税抜）', '売上（税込）', '原価', '利益', '工場時間', '現場時間', '合計時間', '利益率']);
    expect(items[0].children).toHaveLength(2);
    expect(items[0].children[1].textContent).toBe('¥156,000');
    expect(items[0].style.flexDirection).toBe('column');
    expect(items[1].children[1].textContent).toBe('¥171,600');
  });

  it('1920px: 右の列では縦の一覧のまま、売上の下に売上（税込）の行がある', async () => {
    window.innerWidth = 1920;
    renderPage();
    const summary = await ready();
    expect(summary.style.flexWrap).toBe('');
    expect(within(summary).queryAllByTestId('top-summary-item')).toHaveLength(0);
    const text = summary.textContent ?? '';
    expect(text.indexOf('売上（税抜）')).toBeLessThan(text.indexOf('売上（税込）'));
    expect(text.indexOf('売上（税込）')).toBeLessThan(text.indexOf('原価'));
  });
});
