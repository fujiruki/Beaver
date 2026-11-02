import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import VoucherEdit from '../VoucherEdit';
import { AppSettingsProvider } from '../../contexts/AppSettingsContext';

const requests: Array<{ url: string; method: string; body: any }> = [];

function makeLine(id: number, itemName: string) {
  return {
    id, voucher_id: 6, line_no: id, line_type: 'normal',
    location_no: null, location_name: null, tategu_item_id: null,
    source_catalog_item_id: null, item_name: itemName, quantity: 1,
    cost_body: 0, cost_hardware: 0, cost_glass: 0, cost_factory_hours: 0,
    cost_site_hours: 0, cost_labor_rate: 0, snapshot_loaded_at: null,
    price_body: 0, price_hardware: 0, price_glass: 0, line_total: 0,
    tax_category: 'taxable', memo: null, costs: [], prices: [],
  };
}

function makeVoucher() {
  return {
    id: 6, voucher_no: 'V-0006', voucher_type: 'estimate', status: 'draft',
    project_id: null, customer_id: 1, voucher_date: '2026-11-02', delivery_date: null,
    tax_input_type: 'exclusive', consumption_tax_type: '課税', override_billing_date: null,
    profit_rate: 0.3, description: null, memo: null, validity_period: null,
    subtotal_taxable: 0, tax_amount: 0, total_amount: 0,
    lines: [makeLine(1, '明細1'), makeLine(2, '明細2'), makeLine(3, '明細3')],
  };
}

beforeEach(() => {
  localStorage.clear();
  requests.length = 0;
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    requests.push({ url, method, body });
    if (url.endsWith('/customers')) return new Response(JSON.stringify([{ id: 1, name: '得意先A' }]));
    if (url.endsWith('/projects')) return new Response('[]');
    if (url.endsWith('/aggregation-categories')) return new Response(JSON.stringify([
      { id: 1, code: 'MAIN', name: '本体', measure_type: 'money', sort_order: 1 },
    ]));
    if (url.endsWith('/sales-categories')) return new Response('[]');
    if (url.endsWith('/settings')) return new Response('{}');
    if (method === 'GET' && url.endsWith('/vouchers/6')) return new Response(JSON.stringify(makeVoucher()));
    if (method === 'POST' && url.endsWith('/vouchers/6/lines')) {
      return new Response(JSON.stringify({ ...makeLine(99, ''), line_no: 4 }), { status: 201 });
    }
    if (method === 'PUT' && url.endsWith('/vouchers/6/line-order')) {
      return new Response(JSON.stringify({ voucher_updated_at: '2026-11-02 12:00:00' }));
    }
    if (method === 'PUT' && /\/vouchers\/6\/lines\/\d+$/.test(url)) {
      return new Response(JSON.stringify({ voucher_updated_at: '2026-11-02 12:00:00' }));
    }
    return new Response('{}');
  }));
});

function renderVoucher(entry: '/vouchers/new' | '/vouchers/6') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
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

function itemNames() {
  return screen.getAllByPlaceholderText('品名').map(input => (input as HTMLInputElement).value);
}

describe('VoucherEdit R-0238 行の上下移動はline-orderを1回呼ぶ', () => {
  async function putsAfter(click: (user: ReturnType<typeof userEvent.setup>) => Promise<void>) {
    const user = userEvent.setup();
    renderVoucher('/vouchers/6');
    await screen.findByDisplayValue('明細1');
    await user.click(screen.getByRole('radio', { name: '2行目を選択' }));
    await click(user);
    await waitFor(() => expect(requests.some(request => request.method === 'PUT')).toBe(true));
    return requests.filter(request => request.method === 'PUT');
  }

  it('▲で2行目を上げると line_ids [2,1,3] で1回だけ送り、1行ずつのPUTはしない', async () => {
    const puts = await putsAfter(user => user.click(screen.getByRole('button', { name: '▲' })));
    expect(puts.map(request => [request.url.replace(/^.*\/vouchers\/6/, ''), request.body.line_ids])).toEqual([
      ['/line-order', [2, 1, 3]],
    ]);
    expect(itemNames()).toEqual(['明細2', '明細1', '明細3']);
  });

  it('▼で2行目を下げると line_ids [1,3,2] で1回だけ送る', async () => {
    const puts = await putsAfter(user => user.click(screen.getByRole('button', { name: '▼' })));
    expect(puts.map(request => [request.url.replace(/^.*\/vouchers\/6/, ''), request.body.line_ids])).toEqual([
      ['/line-order', [1, 3, 2]],
    ]);
    expect(itemNames()).toEqual(['明細1', '明細3', '明細2']);
  });
});
