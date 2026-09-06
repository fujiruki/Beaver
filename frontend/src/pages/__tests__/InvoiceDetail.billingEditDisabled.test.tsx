import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import InvoiceDetail from '../InvoiceDetail';

const baseInvoice = {
  id: 3,
  invoice_no: 'I-3',
  customer_id: 1,
  customer_name: '既存得意先',
  billing_name_print: '既存得意先',
  invoice_date: '2026-01-01',
  cutoff_date: '2026-01-01',
  billing_date: '2026-01-01',
  carry_forward: 0,
  sales_total: 1000,
  tax_total: 100,
  payment_received: 0,
  invoice_total: 1100,
  next_carry_forward: 1100,
  vouchers: [],
  payments: [
    { id: 10, payment_no: 'P-10', customer_id: 1, invoice_id: 3, payment_date: '2026-01-05',
      amount: 500, payment_type: '振込', memo: null, created_at: '', updated_at: '' },
  ],
};

function stubFetch(billingEditEnabled: boolean) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const u = new URL(url, 'http://localhost');
    if (u.pathname.endsWith('/customers')) {
      return new Response(JSON.stringify([{ id: 1, name: '既存得意先', name_kana: null, memo: null }]), { status: 200 });
    }
    if (u.pathname.endsWith('/vouchers')) {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    if (u.pathname.endsWith('/settings/billing-edit-enabled')) {
      return new Response(JSON.stringify({ billing_edit_enabled: billingEditEnabled }), { status: 200 });
    }
    return new Response(JSON.stringify(baseInvoice), { status: 200 });
  }));
}

function renderPage(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/invoices/new" element={<InvoiceDetail />} />
          <Route path="/invoices/:id" element={<InvoiceDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('InvoiceDetail R-0143 A-B-05 請求・入金編集の封印', () => {
  it('billing_edit_enabled=falseでは請求書削除ボタン・入金登録ボタン・入金取消ボタンが描画されない', async () => {
    stubFetch(false);
    renderPage('/invoices/3');

    await screen.findByText('I-3', { exact: false });
    expect(screen.queryByRole('button', { name: '削除' })).toBeNull();
    expect(screen.queryByRole('button', { name: '+ 入金登録' })).toBeNull();
    expect(screen.queryByRole('button', { name: '取消' })).toBeNull();
  });

  it('billing_edit_enabled=falseでは新規作成フォームの代わりに停止中メッセージが表示される', async () => {
    stubFetch(false);
    renderPage('/invoices/new');

    await screen.findByText(/現在停止しています/);
    expect(screen.queryByRole('button', { name: '作成' })).toBeNull();
  });

  it('billing_edit_enabled=trueでは請求書削除ボタン・入金登録ボタン・入金取消ボタンが描画される（回帰確認）', async () => {
    stubFetch(true);
    renderPage('/invoices/3');

    await screen.findByText('I-3', { exact: false });
    expect(screen.getByRole('button', { name: '削除' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '+ 入金登録' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '取消' })).toBeTruthy();
  });
});
