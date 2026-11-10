import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import VoucherEdit from '../VoucherEdit';
import { AppSettingsProvider } from '../../contexts/AppSettingsContext';

const mkLine = (id: number, extra: Record<string, unknown> = {}) => ({
  id, voucher_id: 5, line_no: id, line_type: 'normal', location_no: null, location_name: null,
  tategu_item_id: null, source_catalog_item_id: null, item_name: `明細${id}`, quantity: 1,
  cost_body: 0, cost_hardware: 0, cost_glass: 0, cost_factory_hours: 0, cost_site_hours: 0,
  cost_labor_rate: 0, snapshot_loaded_at: null, price_body: 0, price_hardware: 0, price_glass: 0,
  line_total: 0, tax_category: 'taxable', memo: null, costs: [], prices: [], ...extra,
});

const baseVoucher = (lines: unknown[], updated_at = '2026-10-10 09:00:00') => ({
  id: 5, voucher_no: 'S-00005', voucher_type: 'sales', status: 'draft', project_id: null, customer_id: 1,
  voucher_date: '2026-10-10', delivery_date: null, tax_input_type: 'exclusive', consumption_tax_type: '外税/伝票計',
  override_billing_date: null, trade_type: '掛売上', description: 'サーバー初期値', profit_rate: 0.3, memo: null,
  sales_category_id: null, validity_period: null, subtotal_taxable: 0, tax_amount: 0, total_amount: 0,
  updated_at, lines, converted_sales: [], access_voucher_id: null,
  access_billed_flag: 0, access_billing_date: null, last_synced_at: null, sync_pending: 0,
});

type Req = { url: string; method: string; body: any };
const requests: Req[] = [];
const writes = () => requests.filter(r => r.method !== 'GET' && r.url.includes('/vouchers/5'));

function setup(opts: { screenLines: unknown[]; latestLines: unknown[]; lineHandler?: (id: number, body: any, nth: number) => Response }) {
  let headerPuts = 0;
  let clock = 0;
  const lineCalls: Record<number, number> = {};
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    requests.push({ url, method, body });
    if (url.endsWith('/customers')) return new Response(JSON.stringify([{ id: 1, name: '得意先A' }]));
    if (url.endsWith('/aggregation-categories')) return new Response(JSON.stringify([
      { id: 1, code: 'body', name: '本体', measure_type: 'money', sort_order: 1 },
    ]));
    if (url.endsWith('/projects') || url.endsWith('/sales-categories')) return new Response('[]');
    if (method === 'PUT' && url.endsWith('/vouchers/5')) {
      headerPuts += 1;
      if (headerPuts === 1) {
        return new Response(JSON.stringify({ error: 'stale_voucher', voucher: baseVoucher(opts.latestLines, '2026-10-10 10:00:00') }), { status: 409 });
      }
      return new Response(JSON.stringify({ ...baseVoucher(opts.latestLines), ...body, updated_at: `2026-10-10 10:00:0${++clock}` }));
    }
    const m = url.match(/\/vouchers\/5\/lines\/(\d+)$/);
    if (method === 'PUT' && m) {
      const id = Number(m[1]);
      lineCalls[id] = (lineCalls[id] ?? 0) + 1;
      if (opts.lineHandler) return opts.lineHandler(id, body, lineCalls[id]);
      return new Response(JSON.stringify({ ...mkLine(id), ...body, voucher_updated_at: `2026-10-10 10:00:0${++clock}` }));
    }
    if (method === 'PUT' && url.endsWith('/vouchers/5/line-order')) {
      return new Response(JSON.stringify({ voucher_updated_at: `2026-10-10 10:00:0${++clock}` }));
    }
    if (url.endsWith('/vouchers/5')) {
      const reordered = requests.some(r => r.method === 'PUT' && r.url.endsWith('/line-order'));
      return new Response(JSON.stringify(baseVoucher(reordered ? opts.latestLines : opts.screenLines)));
    }
    return new Response('{}');
  }));
}

async function renderToStale() {
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
  const user = userEvent.setup();
  await screen.findByDisplayValue('2026-10-10');
  const description = document.querySelector('input[name="description"]') as HTMLInputElement;
  await user.clear(description);
  await user.type(description, '入力中の値');
  await user.tab();
  await screen.findByText(/ほかで更新されています/);
  return user;
}

beforeEach(() => {
  localStorage.clear();
  requests.length = 0;
  vi.stubGlobal('confirm', vi.fn(() => false));
  vi.stubGlobal('alert', vi.fn());
});

describe('R-0257 stale のとき、この画面の内容で上書き', () => {
  it('最新のupdated_atで 見出し→明細→順番 の順に保存し、警告が消える', async () => {
    setup({ screenLines: [mkLine(51), mkLine(52)], latestLines: [mkLine(51), mkLine(52)] });
    const user = await renderToStale();
    const button = screen.getByRole('button', { name: 'この画面の内容で上書き' });
    expect(button.getAttribute('type')).toBe('button');
    expect(screen.getByText('もう一方の画面で保存した内容は、この画面の内容に置き換わります')).toBeTruthy();
    await user.click(button);
    await waitFor(() => expect(screen.queryByText(/ほかで更新されています/)).toBeNull());
    const w = writes().slice(1);
    expect(w.map(r => r.url.replace(/.*\/vouchers\/5/, ''))).toEqual(['', '/lines/51', '/lines/52', '/line-order']);
    expect(w[0].body.expected_updated_at).toBe('2026-10-10 10:00:00');
    expect(w[0].body.description).toBe('入力中の値');
    expect(w[1].body.expected_updated_at).toBe('2026-10-10 10:00:01');
    expect(w[2].body.expected_updated_at).toBe('2026-10-10 10:00:02');
    expect(w[3].body.expected_updated_at).toBe('2026-10-10 10:00:03');
    expect(w[3].body.line_ids).toEqual([51, 52]);
    expect(w[1].body).toMatchObject({ item_name: '明細51', quantity: 1, tax_category: 'taxable', costs: [], prices: [] });
    expect(globalThis.confirm).not.toHaveBeenCalled();
    expect(globalThis.alert).not.toHaveBeenCalled();
  });

  it('台帳ひもづけ行は、応答の労務単価が画面と違えば送り直す', async () => {
    const tategu = mkLine(51, { tategu_item_id: 9, cost_labor_rate: 5000 });
    setup({
      screenLines: [tategu], latestLines: [tategu],
      lineHandler: (id, body, nth) => new Response(JSON.stringify({
        ...mkLine(id), ...body, cost_labor_rate: nth === 1 ? 4000 : body.cost_labor_rate, voucher_updated_at: `2026-10-10 10:00:0${nth + 1}`,
      })),
    });
    const user = await renderToStale();
    await user.click(screen.getByRole('button', { name: 'この画面の内容で上書き' }));
    await waitFor(() => expect(screen.queryByText(/ほかで更新されています/)).toBeNull());
    const linePuts = writes().filter(r => r.url.endsWith('/lines/51'));
    expect(linePuts).toHaveLength(2);
    expect(linePuts[0].body.tategu_item_id).toBe(9);
    expect(linePuts[1].body.cost_labor_rate).toBe(5000);
    expect(linePuts[1].body.expected_updated_at).toBe('2026-10-10 10:00:02');
  });

  it('404の行は飛ばして続け、足された行・消された行の件数を出す', async () => {
    setup({
      screenLines: [mkLine(51), mkLine(53)], latestLines: [mkLine(51), mkLine(60)],
      lineHandler: (id, body) => id === 53
        ? new Response(JSON.stringify({ error: 'not_found' }), { status: 404 })
        : new Response(JSON.stringify({ ...mkLine(id), ...body, voucher_updated_at: '2026-10-10 10:00:09' })),
    });
    const user = await renderToStale();
    await user.click(screen.getByRole('button', { name: 'この画面の内容で上書き' }));
    expect(await screen.findByText(/もう一方の画面で足された明細が1行あります/)).toBeTruthy();
    expect(screen.getByText(/もう一方の画面で消された明細が1行あり、上書きしませんでした/)).toBeTruthy();
    expect(screen.queryByText(/ほかで更新されています/)).toBeNull();
    expect(writes().find(r => r.url.endsWith('/line-order'))?.body.line_ids).toEqual([51]);
  });

  it('途中で失敗したら止めて、もう一度押せる', async () => {
    setup({
      screenLines: [mkLine(51), mkLine(52)], latestLines: [mkLine(51), mkLine(52)],
      lineHandler: (id, body) => id === 52
        ? new Response(JSON.stringify({ error: 'boom' }), { status: 500 })
        : new Response(JSON.stringify({ ...mkLine(id), ...body, voucher_updated_at: '2026-10-10 10:00:09' })),
    });
    const user = await renderToStale();
    await user.click(screen.getByRole('button', { name: 'この画面の内容で上書き' }));
    expect(await screen.findByText(/1行目まで保存しました/)).toBeTruthy();
    expect(writes().some(r => r.url.endsWith('/line-order'))).toBe(false);
    expect(screen.getByRole('button', { name: 'この画面の内容で上書き' })).toBeTruthy();
  });
});
