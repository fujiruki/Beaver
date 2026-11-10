import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

const numberText = (n: number) => `¥${n.toLocaleString()}`;

describe('R-0230 サマリーの置き場所と中身', () => {
  const originalWidth = window.innerWidth;
  afterEach(() => { window.innerWidth = originalWidth; });

  it('大きく出す6つが出て、売値の内訳は出ない', async () => {
    window.innerWidth = 800;
    renderPage();
    const summary = await screen.findByTestId('top-summary');
    await waitFor(() => expect(within(summary).getByText('売上').nextSibling?.textContent).toBe(numberText(159600)));

    const pair = (label: string) => within(summary).getByText(label).nextSibling?.textContent;
    expect(pair('原価')).toBe(numberText(276000));
    expect(pair('利益')).toBe(`¥${(-116400).toLocaleString()}`);
    expect(pair('工場時間')).toBe('24 h（3.0日）');
    expect(pair('現場時間')).toBe('12 h（1.5日）');
    expect(pair('合計時間')).toBe('36 h（4.5日）');
    expect(within(summary).queryByText(/売値/)).toBeNull();
  });

  it('利益率と材料原価の内訳を控えめに出す', async () => {
    renderPage();
    const summary = await screen.findByTestId('top-summary');
    await waitFor(() => expect(within(summary).getByText('利益率').nextSibling?.textContent).toBe('-72.9%'));
    const hint = within(summary).getByTestId('top-summary-material');
    expect(hint.textContent).toContain('本体');
    expect(hint.textContent).toContain('2,400');
    expect(within(summary).getByText('利益率').style.fontSize).toBe('13px');
  });

  it('狭い画面では明細の上、サマリーは明細の下の今のまとめも残る', async () => {
    window.innerWidth = 800;
    renderPage();
    const summary = await screen.findByTestId('top-summary');
    const row = await screen.findByTestId('line-item-0');
    expect(screen.queryByTestId('summary-side')).toBeNull();
    expect(summary.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(screen.getByText('日割り粗利')).not.toBeNull();
  });

  it('広い画面では明細の右に置き、スクロールについてくる', async () => {
    window.innerWidth = 4000;
    renderPage();
    const summary = await screen.findByTestId('top-summary');
    const side = screen.getByTestId('summary-side');
    expect(side.contains(summary)).toBe(true);
    expect(side.style.position).toBe('sticky');
  });
});

describe('R-0230 明細の入力順', () => {
  const follows = (a: Element, b: Element) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

  it('要素の並びは 取付場所→品名→数量→備考→原価→売値', async () => {
    renderPage();
    const row = await screen.findByTestId('line-item-0');
    const els = [
      within(row).getByRole('textbox', { name: '取付場所' }),
      within(row).getByRole('textbox', { name: '取付製品' }),
      within(row).getByRole('textbox', { name: '数量' }),
      within(row).getByRole('button', { name: /^備考/ }),
      within(row).getByRole('textbox', { name: '原価 本体' }),
      within(row).getByRole('textbox', { name: '売値 本体' }),
    ];
    for (let i = 0; i < els.length - 1; i++) expect(follows(els[i], els[i + 1])).toBe(true);
  });

  it('製品台帳のボタンと取付場所は品名と同じ左の欄の中にあり、数量は別の段にある', async () => {
    renderPage();
    const row = await screen.findByTestId('line-item-0');
    const location = within(row).getByRole('textbox', { name: '取付場所' });
    const name = within(row).getByRole('textbox', { name: '取付製品' });
    const quantity = within(row).getByRole('textbox', { name: '数量' });
    expect(location.parentElement).toBe(name.parentElement);
    expect(quantity.parentElement?.parentElement).not.toBe(name.parentElement);
    expect(within(name.parentElement as HTMLElement).getByRole('button', { name: '製品台帳' })).not.toBeNull();
  });

  it('原価・作業の帯が売値の帯より先で、見出しも同じ順', async () => {
    renderPage();
    const row = await screen.findByTestId('line-item-0');
    const cost = within(row).getByTestId('cost-group');
    const price = within(row).getByTestId('price-group');
    expect(follows(cost, price)).toBe(true);
    const right = within(row).getByTestId('line-item-right');
    const labels = [...right.querySelectorAll('span')].map(s => s.textContent);
    expect(labels.indexOf('原価・作業')).toBeGreaterThanOrEqual(0);
    expect(labels.indexOf('原価・作業')).toBeLessThan(labels.indexOf('売値'));
  });

  it('Tab で 取付場所→品名→数量→備考→原価→売値 の順に進む', async () => {
    const user = userEvent.setup();
    renderPage();
    const row = await screen.findByTestId('line-item-0');
    const location = within(row).getByRole('textbox', { name: '取付場所' });
    const targets = ['取付場所', '取付製品', '数量', '備考 ＋', '原価 本体', '売値 本体'];
    location.focus();
    const seen: string[] = [];
    for (let i = 0; i < 20; i++) {
      const label = document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent ?? '';
      if (targets.includes(label) && !seen.includes(label)) seen.push(label);
      await user.tab();
    }
    expect(seen).toEqual(targets);
  });
});
