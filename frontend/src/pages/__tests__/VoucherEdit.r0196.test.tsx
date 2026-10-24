import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import VoucherEdit from '../VoucherEdit';
import { AppSettingsProvider } from '../../contexts/AppSettingsContext';

const baseVoucher = {
  id: 196, voucher_no: 'S-00196', voucher_type: 'sales', status: 'billed', project_id: 1, customer_id: 1,
  voucher_date: '2026-10-24', due_date: null, delivery_date: null, tax_input_type: 'exclusive',
  consumption_tax_type: '外税・伝票計', override_billing_date: null, trade_type: '掛売上', description: '請求済み',
  profit_rate: 0.3, memo: '変更不可', sales_category_id: null, validity_period: null, subtotal_taxable: 0,
  tax_amount: 0, total_amount: 0, lines: [], converted_sales: [], access_voucher_id: null,
  access_billed_flag: 0, access_billing_date: null, last_synced_at: null, sync_pending: 0,
  updated_at: '2026-10-24 12:00:00',
};

let requests: Array<{ method: string; body?: Record<string, unknown> }>;

function renderPage(voucher: Record<string, unknown>) {
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    if (method === 'PUT' && url.endsWith('/vouchers/196')) {
      requests.push({ method, body });
      return new Response(JSON.stringify({ ...voucher, ...body, updated_at: '2026-10-24 12:00:01' }));
    }
    if (url.endsWith('/customers')) return new Response(JSON.stringify([{ id: 1, name: '得意先' }]));
    if (url.endsWith('/projects')) return new Response(JSON.stringify([
      { id: 1, customer_id: 1, name: '旧案件' }, { id: 2, customer_id: 1, name: '新案件' },
    ]));
    if (url.endsWith('/aggregation-categories') || url.endsWith('/sales-categories')) return new Response('[]');
    if (url.endsWith('/vouchers/196')) return new Response(JSON.stringify(voucher));
    return new Response('{}');
  }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AppSettingsProvider>
        <MemoryRouter initialEntries={['/vouchers/196']}>
          <Routes><Route path="/vouchers/:id" element={<VoucherEdit />} /></Routes>
        </MemoryRouter>
      </AppSettingsProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  requests = [];
});

describe('R-0196 請求済み伝票の案件変更', () => {
  it('status=billedでは案件だけ操作でき、案件だけをPUTする', async () => {
    renderPage(baseVoucher);
    await screen.findByText('新案件');
    const project = document.querySelector('select[name="project_id"]') as HTMLSelectElement;
    expect(project.disabled).toBe(false);
    expect((document.querySelector('select[name="customer_id"]') as HTMLSelectElement).disabled).toBe(true);
    expect((document.querySelector('input[name="description"]') as HTMLInputElement).disabled).toBe(true);

    fireEvent.change(project, { target: { value: '2' } });
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0].body).toEqual({ project_id: 2, expected_updated_at: '2026-10-24 12:00:00' });
  });

  it('access_billed_flag=1でも案件だけ操作できる', async () => {
    renderPage({ ...baseVoucher, status: 'approved', access_billed_flag: 1 });
    await screen.findByText('新案件');
    expect((document.querySelector('select[name="project_id"]') as HTMLSelectElement).disabled).toBe(false);
    expect((document.querySelector('select[name="customer_id"]') as HTMLSelectElement).disabled).toBe(true);
  });
});
