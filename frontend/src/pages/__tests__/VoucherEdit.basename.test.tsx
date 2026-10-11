import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import VoucherEdit from '../VoucherEdit';
import { AppSettingsProvider } from '../../contexts/AppSettingsContext';

const BASENAME = '/contents/Beaver_beta';

const voucher = {
  id: 5, voucher_no: 'S-00005', voucher_type: 'sales', status: 'draft', project_id: null, customer_id: 1,
  voucher_date: '2026-10-10', delivery_date: null, tax_input_type: 'exclusive', consumption_tax_type: '外税/伝票計',
  override_billing_date: null, trade_type: '掛売上', description: '変更前', profit_rate: 0.3, memo: null,
  sales_category_id: null, validity_period: null, subtotal_taxable: 0, tax_amount: 0, total_amount: 0,
  updated_at: '2026-10-10 09:00:00', lines: [], converted_sales: [], access_voucher_id: null,
  access_billed_flag: 0, access_billing_date: null, last_synced_at: null, sync_pending: 0,
};

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('confirm', vi.fn(() => false));
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    if (url.endsWith('/customers')) return new Response(JSON.stringify([{ id: 1, name: '得意先A' }]));
    if (url.endsWith('/projects') || url.endsWith('/aggregation-categories') || url.endsWith('/sales-categories')) {
      return new Response('[]');
    }
    if (method === 'PUT' && url.endsWith('/vouchers/5')) {
      const body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ ...voucher, ...body, updated_at: '2026-10-10 09:00:01' }));
    }
    if (url.endsWith('/vouchers/5')) return new Response(JSON.stringify(voucher));
    return new Response('{}');
  }));
});

describe('離脱ガード後の再遷移でbasenameを二重にしない', () => {
  it('basename付きルーターで保存後の遷移先にbasenameが1回だけ付く', async () => {
    const router = createMemoryRouter([
      { path: '/vouchers/:id', element: <VoucherEdit /> },
      { path: '/vouchers', element: <div>伝票一覧</div> },
    ], { basename: BASENAME, initialEntries: [`${BASENAME}/vouchers/5`] });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <AppSettingsProvider><RouterProvider router={router} /></AppSettingsProvider>
      </QueryClientProvider>,
    );
    const user = userEvent.setup();
    await screen.findByText('Beaver作成');
    const description = document.querySelector('input[name="description"]') as HTMLInputElement;
    await user.clear(description);
    await user.type(description, '入力中の摘要');
    await user.click(screen.getByRole('button', { name: '閉じる' }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`${BASENAME}/vouchers`));
    expect(await screen.findByText('伝票一覧')).toBeTruthy();
  });
});
