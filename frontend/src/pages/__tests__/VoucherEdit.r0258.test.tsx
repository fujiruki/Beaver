import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import VoucherEdit from '../VoucherEdit';
import { AppSettingsProvider } from '../../contexts/AppSettingsContext';

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

const puts: any[] = [];

function stubFetch() {
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    if (url.endsWith('/customers')) return new Response(JSON.stringify([{ id: 1, name: '得意先A' }]));
    if (url.endsWith('/aggregation-categories')) return new Response(JSON.stringify(categories));
    if (url.endsWith('/projects') || url.endsWith('/sales-categories')) return new Response('[]');
    if (method === 'PUT' && /\/vouchers\/5\/lines\/\d+$/.test(url)) {
      puts.push(body);
      return new Response(JSON.stringify({ ...line, ...body, voucher_updated_at: '2026-10-10 09:00:02' }));
    }
    if (url.endsWith('/vouchers/5')) return new Response(JSON.stringify(voucher));
    return new Response('{}');
  }));
}

function renderPage(readOnly = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const router = createMemoryRouter([
    { path: '/vouchers/:id', element: <VoucherEdit /> },
  ], { initialEntries: [`/vouchers/5${readOnly ? '?readonly=1' : ''}`] });
  return render(
    <QueryClientProvider client={client}>
      <AppSettingsProvider><RouterProvider router={router} /></AppSettingsProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  puts.length = 0;
  stubFetch();
});

const wait = async () => {
  const summary = await screen.findByTestId('top-summary');
  await screen.findByTestId('line-item-0');
  return summary;
};

describe('R-0258 明細の原価は1個あたり', () => {
  it('数量3の行で、材料原価・労務費・製造原価は数量を掛けない', async () => {
    renderPage();
    const row = await screen.findByTestId('line-item-0');
    expect(within(row).getByText(/^材料原価/).textContent).toBe('材料原価 ¥400');
    expect(within(row).getByText(/^労務費/).textContent).toBe('労務費 ¥45,600');
    expect(within(row).getByText(/^製造原価/).textContent).toBe('製造原価 ¥46,000');
  });

  it('単価・金額・利益は行全体の今の値のまま', async () => {
    renderPage();
    const row = await screen.findByTestId('line-item-0');
    expect(within(row).getByText(/^単価/).textContent).toContain('26,600');
    expect(within(row).getByText(/^金額/).textContent).toContain('79,800');
    expect(within(row).getByText(/^利益(?:\s|¥|-|−)/).textContent).toContain('58,200');
  });
});

describe('R-0259 利益率のバーはサマリーの中', () => {
  const originalWidth = window.innerWidth;
  afterEach(() => { window.innerWidth = originalWidth; });

  it('広い画面ではサマリーの中、数字の下にあり、明細の上には無い', async () => {
    window.innerWidth = 4000;
    renderPage();
    const summary = await wait();
    const button = screen.getByRole('button', { name: '原価から売値を設定' });
    expect(screen.getAllByRole('button', { name: '原価から売値を設定' })).toHaveLength(1);
    expect(summary.contains(button)).toBe(true);
    expect(screen.getByTestId('summary-side').contains(button)).toBe(true);
    expect(within(summary).getByText('合計時間').compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
  });

  it('狭い画面ではサマリーの外で、明細の見出しと同じ上にくっつく帯の中', async () => {
    window.innerWidth = 800;
    renderPage();
    const summary = await wait();
    const button = screen.getByRole('button', { name: '原価から売値を設定' });
    expect(summary.contains(button)).toBe(false);
    const band = screen.getByTestId('line-item-sticky');
    expect(band.contains(button)).toBe(true);
    expect(band.contains(screen.getByTestId('line-item-heading'))).toBe(true);
  });
});

describe('R-0260 明細の見出しはついてくる', () => {
  it('見出しは横スクロールの箱の外の、上にくっつく帯にあり、横スクロールに合わせて動く', async () => {
    renderPage();
    await wait();
    const band = screen.getByTestId('line-item-sticky');
    const scroller = screen.getByTestId('line-item-scroll');
    const heading = screen.getByTestId('line-item-heading');
    expect(band.style.position).toBe('sticky');
    expect(scroller.contains(heading)).toBe(false);
    expect(scroller.contains(band)).toBe(false);
    expect(scroller.contains(screen.getByTestId('line-item-0'))).toBe(true);

    scroller.scrollLeft = 120;
    fireEvent.scroll(scroller);
    expect(screen.getByTestId('line-item-heading-slide').style.transform).toBe('translateX(-120px)');
  });
});
