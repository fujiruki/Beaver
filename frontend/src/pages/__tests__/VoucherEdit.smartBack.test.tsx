import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import VoucherEdit from '../VoucherEdit';

const baseVoucher = {
  id: 42,
  voucher_no: 'S-42',
  voucher_type: 'sales',
  status: 'draft',
  project_id: null,
  customer_id: 1,
  voucher_date: '2026-01-01',
  delivery_date: null,
  tax_input_type: 'exclusive',
  consumption_tax_type: '課税',
  override_billing_date: null,
  profit_rate: 0.3,
  description: null,
  memo: null,
  validity_period: null,
  trade_type: '掛売上',
  sales_category_id: null,
  subtotal_taxable: 0,
  tax_amount: 0,
  total_amount: 0,
  lines: [],
};

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const u = new URL(url, 'http://localhost');
    if (u.pathname.endsWith('/customers')) {
      return new Response(JSON.stringify([{ id: 1, name: '既存得意先', name_kana: null, memo: null }]), { status: 200 });
    }
    if (u.pathname.endsWith('/projects')) {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    if (u.pathname.endsWith('/aggregation-categories')) {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    if (u.pathname.endsWith('/sales-categories')) {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    return new Response(JSON.stringify(baseVoucher), { status: 200 });
  }));
});

function VoucherListStub() {
  const location = useLocation();
  return <div>一覧画面: {location.search}</div>;
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter
        initialEntries={['/vouchers?sort=voucher_date&order=desc', '/vouchers/42']}
        initialIndex={1}
      >
        <Routes>
          <Route path="/vouchers/:id" element={<VoucherEdit />} />
          <Route path="/vouchers" element={<VoucherListStub />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('VoucherEdit 戻る (R-0096 Phase2b)', () => {
  it('一覧のソート状態を保持したまま保存成功後に一覧に戻る', async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole('button', { name: '保存' });
    // 得意先データ読み込みとフォームreset()のタイミング差があるため明示的に選び直す
    const customerSelect = document.querySelector('select[name="customer_id"]') as HTMLSelectElement;
    await user.selectOptions(customerSelect, '1');
    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(await screen.findByText('一覧画面: ?sort=voucher_date&order=desc')).toBeTruthy();
  });

  it('一覧のソート状態を保持したまま「キャンセル」で一覧に戻る', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'キャンセル' }));

    expect(await screen.findByText('一覧画面: ?sort=voucher_date&order=desc')).toBeTruthy();
  });
});
