import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import CustomerDetail from '../CustomerDetail';

const baseCustomer = {
  id: 1,
  code: 'C-1',
  name: '既存得意先',
  name_kana: null,
  honorific_type: '御中',
  cutoff_day: 31,
  billing_offset_days: 15,
  payment_due_days: 30,
  billing_date_print: 0,
  is_active: 1,
  carry_forward_balance: 1000,
  memo: null,
};

function stubFetch(billingEditEnabled: boolean) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const u = new URL(url, 'http://localhost');
    if (u.pathname.endsWith('/settings/billing-edit-enabled')) {
      return new Response(JSON.stringify({ billing_edit_enabled: billingEditEnabled }), { status: 200 });
    }
    return new Response(JSON.stringify(baseCustomer), { status: 200 });
  }));
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/customers/1']}>
        <Routes>
          <Route path="/customers/:id" element={<CustomerDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('CustomerDetail R-0143 A-B-05 請求・入金編集の封印', () => {
  it('billing_edit_enabled=falseでは繰越残高の「修正する」リンクが描画されない', async () => {
    stubFetch(false);
    renderPage();

    await screen.findByText('¥1,000');
    expect(screen.queryByRole('link', { name: '修正する' })).toBeNull();
  });

  it('billing_edit_enabled=trueでは繰越残高の「修正する」リンクが描画される（回帰確認）', async () => {
    stubFetch(true);
    renderPage();

    await screen.findByText('¥1,000');
    expect(screen.getByRole('link', { name: '修正する' })).toBeTruthy();
  });
});
