import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import VoucherEdit from '../VoucherEdit';
import { AppSettingsProvider } from '../../contexts/AppSettingsContext';

const baseVoucher = {
  id: 5, voucher_no: 'S-00005', voucher_type: 'sales', status: 'draft', project_id: null, customer_id: 1,
  voucher_date: '2026-10-10', delivery_date: null, tax_input_type: 'exclusive', consumption_tax_type: '外税/伝票計',
  override_billing_date: null, trade_type: '掛売上', description: null, profit_rate: 0.3, memo: null,
  sales_category_id: null, validity_period: null, subtotal_taxable: 0, tax_amount: 0, total_amount: 0, lines: [],
  converted_sales: [], access_voucher_id: 12102 as number | null, access_billed_flag: 0, access_billing_date: null,
  last_synced_at: '2026-10-10 16:08:09', updated_at: '2026-10-10 16:09:12', sync_pending: 0,
};

function renderVoucher(voucher = baseVoucher) {
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith('/customers')) return new Response(JSON.stringify([{ id: 1, name: '得意先A' }]));
    if (url.endsWith('/projects') || url.endsWith('/aggregation-categories') || url.endsWith('/sales-categories')) return new Response('[]');
    if (url.endsWith('/vouchers/5')) return new Response(JSON.stringify(voucher));
    return new Response('{}');
  }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AppSettingsProvider>
        <MemoryRouter initialEntries={['/vouchers/5']}>
          <Routes><Route path="/vouchers/:id" element={<VoucherEdit />} /></Routes>
        </MemoryRouter>
      </AppSettingsProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => localStorage.clear());

describe('R-0163 伝票編集画面の連携番号と更新時刻', () => {
  it('access_voucher_idがある伝票はAccess番号と最終更新を表示する', async () => {
    renderVoucher();
    expect(await screen.findByText('Access№ 12102')).toBeTruthy();
    expect(screen.getByText('最終更新: 2026-10-10 16:09:12')).toBeTruthy();
  });

  it('access_voucher_idがない伝票はAccess番号を表示しない', async () => {
    renderVoucher({ ...baseVoucher, access_voucher_id: null });
    await screen.findByText('Beaver作成');
    expect(screen.queryByText(/Access№/)).toBeNull();
  });
});
