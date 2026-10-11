import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import VoucherEdit from '../VoucherEdit';
import { AppSettingsProvider } from '../../contexts/AppSettingsContext';

const baseLine = {
  id: 51, voucher_id: 5, line_no: 1, line_type: 'normal', location_no: null, location_name: null,
  tategu_item_id: null, source_catalog_item_id: null, item_name: '既存明細', quantity: 1,
  cost_body: 0, cost_hardware: 0, cost_glass: 0, cost_factory_hours: 0, cost_site_hours: 0,
  cost_labor_rate: 0, snapshot_loaded_at: null, price_body: 0, price_hardware: 0, price_glass: 0,
  line_total: 0, tax_category: 'taxable', memo: null, costs: [], prices: [],
};

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
  let nextLineId = 52;
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
    if (method === 'POST' && url.endsWith('/vouchers/5/lines')) {
      const id = nextLineId++;
      return new Response(JSON.stringify({
        ...baseLine, ...body, id, line_no: id - 50, item_name: null, voucher_updated_at: '2026-10-10 09:00:01',
      }), { status: 201 });
    }
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

const linePosts = () => requests.filter(r => r.method === 'POST' && r.url.endsWith('/vouchers/5/lines'));
const linePuts = (lineId: number) => requests.filter(r => r.method === 'PUT' && r.url.endsWith(`/vouchers/5/lines/${lineId}`));

beforeEach(() => {
  localStorage.clear();
  requests.length = 0;
  vi.stubGlobal('confirm', vi.fn(() => false));
});

describe('R-0164 既存伝票の明細行はフォーカスが外れたときに保存する', () => {
  it('行を追加して入力しフォーカスを外すと、作成した行を更新して保存時刻を表示する', async () => {
    const user = userEvent.setup();
    stubFetch();
    renderPage();
    await screen.findByText('Beaver作成');
    await user.click(screen.getByRole('button', { name: '+ 行を追加' }));
    await waitFor(() => expect(linePosts()).toHaveLength(1));
    const itemName = await waitFor(() => {
      const el = document.querySelector('input[name="lines.1.item_name"]') as HTMLInputElement | null;
      expect(el).not.toBeNull();
      return el!;
    });
    await user.type(itemName, '追加した明細');
    await user.tab();
    // 追加した行の先頭の入力欄にフォーカスが移るため、品名をクリックした時点のblurでも1回保存される
    await waitFor(() => expect(linePuts(52).at(-1)?.body.item_name).toBe('追加した明細'));
    expect(linePuts(52)[0].body.expected_updated_at).toBe('2026-10-10 09:00:01');
    expect(linePosts()).toHaveLength(1);
    expect(await screen.findByText(/保存しました \d{2}:\d{2}/)).toBeTruthy();
  });

  it('既存の行を編集してフォーカスを外すと、その行を更新して保存時刻を表示する', async () => {
    const user = userEvent.setup();
    stubFetch();
    renderPage();
    await screen.findByText('Beaver作成');
    const itemName = document.querySelector('input[name="lines.0.item_name"]') as HTMLInputElement;
    await user.type(itemName, '追記');
    await user.tab();
    await waitFor(() => expect(linePuts(51)).toHaveLength(1));
    expect(linePuts(51)[0].body.item_name).toBe('既存明細追記');
    expect(await screen.findByText(/保存しました \d{2}:\d{2}/)).toBeTruthy();
  });
});
