import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import InvoiceList from '../InvoiceList';

const INVOICES = [
  {
    id: 1, invoice_no: 'INV-001', customer_id: 1, customer_name: 'A社',
    invoice_date: '2026-01-01', cutoff_date: '2026-01-31', billing_date: '2026-02-05',
    carry_forward: 0, sales_total: 300, tax_total: 30, payment_received: 0,
    invoice_total: 330, next_carry_forward: 330, billing_name_print: '',
    created_at: '', updated_at: '',
  },
];

function stubFetch(billingEditEnabled: boolean) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const u = new URL(url, 'http://localhost');
    if (u.pathname.endsWith('/customers')) {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    if (u.pathname.endsWith('/settings/billing-edit-enabled')) {
      return new Response(JSON.stringify({ billing_edit_enabled: billingEditEnabled }), { status: 200 });
    }
    return new Response(JSON.stringify(INVOICES), { status: 200 });
  }));
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <InvoiceList />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('InvoiceList R-0143 A-B-05 請求・入金編集の封印', () => {
  it('billing_edit_enabled=falseでは「+ 新規請求書」ボタンが描画されない', async () => {
    stubFetch(false);
    renderPage();
    await screen.findByText('INV-001');
    expect(screen.queryByRole('button', { name: '+ 新規請求書' })).toBeNull();
  });

  it('billing_edit_enabled=trueでは「+ 新規請求書」ボタンが描画される（回帰確認）', async () => {
    stubFetch(true);
    renderPage();
    await screen.findByText('INV-001');
    expect(screen.getByRole('button', { name: '+ 新規請求書' })).toBeTruthy();
  });
});
