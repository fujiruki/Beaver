import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
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
  payments: [],
};

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const u = new URL(url, 'http://localhost');
    if (u.pathname.endsWith('/customers')) {
      return new Response(JSON.stringify([{ id: 1, name: '既存得意先', name_kana: null, memo: null }]), { status: 200 });
    }
    if (u.pathname.endsWith('/vouchers')) {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    // このテスト群は請求・入金編集が有効な状態（billing_edit_enabled=true）での挙動を検証する
    if (u.pathname.endsWith('/settings/billing-edit-enabled')) {
      return new Response(JSON.stringify({ billing_edit_enabled: true }), { status: 200 });
    }
    return new Response(JSON.stringify(baseInvoice), { status: 200 });
  }));
});

function InvoiceListStub() {
  const location = useLocation();
  const state = location.state as { toast?: { message: string } } | null;
  return <div>一覧画面: {location.search} / トースト: {state?.toast?.message ?? 'なし'}</div>;
}

function renderPage(entries: string[], index: number) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={entries} initialIndex={index}>
        <Routes>
          <Route path="/invoices/new" element={<InvoiceDetail />} />
          <Route path="/invoices/:id" element={<InvoiceDetail />} />
          <Route path="/invoices" element={<InvoiceListStub />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('InvoiceDetail 戻る (R-0096 Phase2b)', () => {
  it('一覧のソート状態を保持したまま新規作成成功後に一覧に戻る', async () => {
    const user = userEvent.setup();
    renderPage(['/invoices?sort=billing_date&order=desc', '/invoices/new'], 1);

    await screen.findByRole('option', { name: '既存得意先' });
    const customerSelect = screen.getByRole('combobox');
    await user.selectOptions(customerSelect, '1');
    await user.click(screen.getByRole('button', { name: '作成' }));

    expect(await screen.findByText(/一覧画面: \?sort=billing_date&order=desc/)).toBeTruthy();
  });

  it('履歴が無い場合、削除成功後にフォールバック先でトーストが表示される', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('confirm', vi.fn(() => true));
    renderPage(['/invoices/3'], 0);

    await user.click(await screen.findByRole('button', { name: '削除' }));

    expect(await screen.findByText(/トースト: 請求書 I-3 を削除しました/)).toBeTruthy();
  });

  it('一覧のソート状態を保持したまま削除成功後に一覧に戻る（R-0096 Phase2b）', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('confirm', vi.fn(() => true));
    renderPage(['/invoices?sort=billing_date&order=desc', '/invoices/3'], 1);

    await user.click(await screen.findByRole('button', { name: '削除' }));

    expect(await screen.findByText(/一覧画面: \?sort=billing_date&order=desc/)).toBeTruthy();
  });
});
