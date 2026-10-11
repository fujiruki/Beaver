import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import VoucherEdit from '../VoucherEdit';
import { AppSettingsProvider } from '../../contexts/AppSettingsContext';

const baseVoucher = {
  id: 5, voucher_no: 'S-00005', voucher_type: 'sales', status: 'draft', project_id: null, customer_id: 1,
  voucher_date: '2026-10-10', delivery_date: null, tax_input_type: 'exclusive', consumption_tax_type: '外税/伝票計',
  override_billing_date: null, trade_type: '掛売上', description: null, profit_rate: 0.3, memo: null,
  sales_category_id: null, validity_period: null, subtotal_taxable: 0, tax_amount: 0, total_amount: 0, lines: [],
  converted_sales: [], access_voucher_id: null, access_billed_flag: 0, access_billing_date: null,
  last_synced_at: null, sync_pending: 0, updated_at: '2026-10-10 09:00:00',
};

function stubFetch(putResponse: () => Response) {
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    if (url.endsWith('/customers')) return new Response(JSON.stringify([{ id: 1, name: '得意先A' }]));
    if (url.endsWith('/projects') || url.endsWith('/aggregation-categories') || url.endsWith('/sales-categories')) return new Response('[]');
    if (method === 'PUT' && url.endsWith('/vouchers/5')) return putResponse();
    if (url.endsWith('/vouchers/5')) return new Response(JSON.stringify(baseVoucher));
    return new Response('{}');
  }));
}

function renderPage(path = '/vouchers/5') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const router = createMemoryRouter([
    { path: '/vouchers/new', element: <VoucherEdit /> },
    { path: '/vouchers/:id', element: <VoucherEdit /> },
  ], { initialEntries: [path] });
  render(
    <QueryClientProvider client={client}>
      <AppSettingsProvider><RouterProvider router={router} /></AppSettingsProvider>
    </QueryClientProvider>,
  );
}

function expectFixedBottomRight(el: HTMLElement) {
  const box = el.closest('[data-testid="save-status"]') as HTMLElement | null;
  expect(box).toBeTruthy();
  expect(box!.style.position).toBe('fixed');
  expect(box!.style.right).not.toBe('');
  expect(box!.style.bottom).not.toBe('');
}

async function editDescription() {
  const user = userEvent.setup();
  await screen.findByText('Beaver作成');
  await user.type(document.querySelector('input[name="description"]') as HTMLInputElement, '山田様邸');
  await user.tab();
}

beforeEach(() => {
  localStorage.clear();
});

describe('R-0172: 伝票画面の保存状態を右下に固定表示する', () => {
  it('保存しました HH:MM を右下固定の枠に1回だけ出す', async () => {
    stubFetch(() => new Response(JSON.stringify({ ...baseVoucher, description: '山田様邸' })));
    renderPage();
    await editDescription();
    const saved = await screen.findByText(/保存しました \d{2}:\d{2}/);
    expectFixedBottomRight(saved);
    expect(screen.getAllByText(/保存しました \d{2}:\d{2}/)).toHaveLength(1);
  });

  it('保存失敗と再試行ボタンも右下固定の枠に出す', async () => {
    stubFetch(() => new Response(JSON.stringify({ error: '一時的な障害' }), { status: 500 }));
    renderPage();
    await editDescription();
    expectFixedBottomRight(await screen.findByRole('button', { name: '再試行' }));
  });

  it('R-0166 の再読み込み案内も右下固定の枠に出す', async () => {
    stubFetch(() => new Response(JSON.stringify({
      error: 'stale_voucher', voucher: { ...baseVoucher, updated_at: '2026-10-10 10:00:00' },
    }), { status: 409 }));
    renderPage();
    await editDescription();
    expectFixedBottomRight(await screen.findByText(/ほかで更新されています/));
    expectFixedBottomRight(screen.getByRole('button', { name: '再読み込み' }));
  });

  it('新規伝票では保存状態の枠を出さない', async () => {
    stubFetch(() => new Response('{}'));
    renderPage('/vouchers/new');
    await screen.findByRole('button', { name: '保存' });
    expect(document.querySelector('[data-testid="save-status"]')).toBeNull();
  });
});
