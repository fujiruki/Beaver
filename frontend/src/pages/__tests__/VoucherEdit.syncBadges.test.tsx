import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';
import VoucherEdit from '../VoucherEdit';
import { AppSettingsProvider } from '../../contexts/AppSettingsContext';

const baseVoucher = {
  id: 5,
  voucher_no: 'S-00005',
  voucher_type: 'sales',
  status: 'approved',
  project_id: null,
  customer_id: 1,
  voucher_date: '2026-09-01',
  delivery_date: null,
  tax_input_type: 'exclusive',
  consumption_tax_type: '外税/伝票計',
  override_billing_date: null,
  trade_type: '掛売上',
  description: null,
  profit_rate: 0.3,
  memo: null,
  sales_category_id: null,
  validity_period: null,
  subtotal_taxable: 0,
  tax_amount: 0,
  total_amount: 0,
  lines: [],
  converted_sales: [],
  access_voucher_id: null,
  access_billed_flag: 0,
  access_billing_date: null,
  last_synced_at: null,
  sync_pending: 0,
};

function stubFetch(voucher: Record<string, unknown>) {
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith('/customers')) return new Response(JSON.stringify([{ id: 1, name: '得意先A' }]));
    if (url.endsWith('/projects')) return new Response('[]');
    if (url.endsWith('/aggregation-categories')) return new Response('[]');
    if (url.endsWith('/sales-categories')) return new Response('[]');
    if (url.endsWith('/vouchers/5')) return new Response(JSON.stringify(voucher));
    return new Response('{}');
  }));
}

function renderVoucher(entry = '/vouchers/5') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AppSettingsProvider>
        <MemoryRouter initialEntries={[entry]}>
          <Routes><Route path="/vouchers/:id" element={<VoucherEdit />} /></Routes>
        </MemoryRouter>
      </AppSettingsProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
});

describe('VoucherEdit R-0143 A-B-06 同期バッジ・ロック表示', () => {
  it('access_voucher_id が非nullなら「Access由来」バッジを表示する', async () => {
    stubFetch({ ...baseVoucher, access_voucher_id: 999 });
    renderVoucher();
    expect(await screen.findByText('Access由来')).toBeTruthy();
    expect(screen.queryByText('Beaver作成')).toBeNull();
  });

  it('access_voucher_id が null なら「Beaver作成」バッジを表示する', async () => {
    stubFetch({ ...baseVoucher, access_voucher_id: null });
    renderVoucher();
    expect(await screen.findByText('Beaver作成')).toBeTruthy();
    expect(screen.queryByText('Access由来')).toBeNull();
  });

  it('sync_pending=1なら確認待ちバナーを表示する', async () => {
    stubFetch({ ...baseVoucher, sync_pending: 1 });
    renderVoucher();
    expect(await screen.findByText('Access で確認待ちです')).toBeTruthy();
  });

  it('sync_pending=0なら確認待ちバナーを表示しない', async () => {
    stubFetch({ ...baseVoucher, sync_pending: 0 });
    renderVoucher();
    await screen.findByText('Beaver作成');
    expect(screen.queryByText('Access で確認待ちです')).toBeNull();
  });

  it('access_billed_flag=1なら請求済みロック表示を出し、保存ボタンを無効化する', async () => {
    stubFetch({ ...baseVoucher, access_billed_flag: 1, access_billing_date: '2026-09-10' });
    renderVoucher();
    expect(await screen.findByText(/Accessで請求済み（請求日 2026\/09\/10）/)).toBeTruthy();
    expect((screen.getByRole('button', { name: '保存' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('access_billed_flag=0なら請求済みロック表示を出さず、保存ボタンは有効', async () => {
    stubFetch({ ...baseVoucher, access_billed_flag: 0 });
    renderVoucher();
    await screen.findByText('Beaver作成');
    expect(screen.queryByText(/Accessで請求済み/)).toBeNull();
    expect((screen.getByRole('button', { name: '保存' }) as HTMLButtonElement).disabled).toBe(false);
  });
});
