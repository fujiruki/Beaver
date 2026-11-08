import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import VoucherEdit from '../VoucherEdit';
import { AppSettingsProvider } from '../../contexts/AppSettingsContext';

const requests: Array<{ url: string; method: string; body: any }> = [];
const lineOrderStatuses: number[] = [];
let serverLineIds: number[] = [];
let nextLineId = 100;

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
  lineOrderStatuses.length = 0;
  serverLineIds = [1, 2, 3];
  nextLineId = 100;
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
      await new Promise(resolve => setTimeout(resolve, 5));
      const id = nextLineId++;
      serverLineIds.push(id);
      return new Response(JSON.stringify({ ...makeLine(id, ''), line_no: serverLineIds.length }), { status: 201 });
    }
    if (method === 'PUT' && url.endsWith('/vouchers/6/line-order')) {
      const ids: number[] = body.line_ids;
      const same = ids.length === serverLineIds.length && [...ids].sort().join() === [...serverLineIds].sort().join();
      lineOrderStatuses.push(same ? 200 : 400);
      if (!same) return new Response(JSON.stringify({ error: 'line_ids mismatch' }), { status: 400 });
      serverLineIds = [...ids];
      return new Response(JSON.stringify({ voucher_updated_at: '2026-11-02 12:00:00' }));
    }
    if (method === 'PUT' && /\/vouchers\/6\/lines\/\d+$/.test(url)) {
      return new Response(JSON.stringify({ voucher_updated_at: '2026-11-02 12:00:00' }));
    }
    return new Response('{}');
  }));
});

function renderVoucher() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AppSettingsProvider>
        <MemoryRouter initialEntries={['/vouchers/6']}>
          <Routes>
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

describe('VoucherEdit R-0249 行を挿入の連打でもline-orderが400にならない', () => {
  it('2行目を選んで「行を挿入」を await せず3回押すと、POST3回・line-orderはすべて200・6行になる', async () => {
    const user = userEvent.setup();
    renderVoucher();
    await screen.findByDisplayValue('明細1');
    await user.click(screen.getByRole('radio', { name: '2行目を選択' }));
    const button = screen.getByRole('button', { name: '行を挿入' });
    void user.click(button);
    void user.click(button);
    await user.click(button);

    await waitFor(() => expect(lineOrderStatuses.length).toBeGreaterThanOrEqual(3));
    await waitFor(() => expect(itemNames()).toHaveLength(6));
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(requests.filter(r => r.method === 'POST')).toHaveLength(3);
    expect(lineOrderStatuses.every(status => status === 200)).toBe(true);
    expect(itemNames()).toEqual(['明細1', '', '', '', '明細2', '明細3']);
    expect(serverLineIds[0]).toBe(1);
    expect(serverLineIds.slice(-2)).toEqual([2, 3]);
  });

  it('▲を素早く2回押しても、line-orderはすべて200', async () => {
    const user = userEvent.setup();
    renderVoucher();
    await screen.findByDisplayValue('明細1');
    await user.click(screen.getByRole('radio', { name: '3行目を選択' }));
    const button = screen.getByRole('button', { name: '▲' });
    void user.click(button);
    await user.click(button);

    await waitFor(() => expect(lineOrderStatuses.length).toBeGreaterThanOrEqual(2));
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(lineOrderStatuses.every(status => status === 200)).toBe(true);
    expect(itemNames()).toEqual(['明細3', '明細1', '明細2']);
  });
});
