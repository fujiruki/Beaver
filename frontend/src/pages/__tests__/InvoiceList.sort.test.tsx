import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import InvoiceList from '../InvoiceList';

const INVOICES = [
  {
    id: 1, invoice_no: 'INV-001', customer_id: 1, customer_name: 'B社',
    invoice_date: '2026-01-01', cutoff_date: '2026-01-31', billing_date: '2026-02-05',
    carry_forward: 0, sales_total: 300, tax_total: 30, payment_received: 0,
    invoice_total: 330, next_carry_forward: 330, billing_name_print: '',
    created_at: '', updated_at: '',
  },
  {
    id: 2, invoice_no: 'INV-002', customer_id: 2, customer_name: 'A社',
    invoice_date: '2026-02-01', cutoff_date: '2026-02-28', billing_date: '2026-03-01',
    carry_forward: 0, sales_total: 100, tax_total: 10, payment_received: 0,
    invoice_total: 110, next_carry_forward: 110, billing_name_print: '',
    created_at: '', updated_at: '',
  },
];

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const body = url.includes('/customers') ? [] : INVOICES;
    return new Response(JSON.stringify(body), { status: 200 });
  }));
});

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

function invoiceNoOrder(): string[] {
  return Array.from(document.querySelectorAll('tbody tr'))
    .map(tr => tr.querySelector('td')?.textContent ?? '');
}

describe('InvoiceList クライアントソート', () => {
  it('初期表示はサーバから取得した順序のまま', async () => {
    renderPage();
    await screen.findByText('INV-001');
    expect(invoiceNoOrder()).toEqual(['INV-001', 'INV-002']);
  });

  it('売上合計の見出しクリックで数値昇順に並び替わる', async () => {
    renderPage();
    await screen.findByText('INV-001');

    fireEvent.click(screen.getByText('売上合計'));

    await waitFor(() => {
      expect(invoiceNoOrder()).toEqual(['INV-002', 'INV-001']);
    });
  });

  it('売上合計を再クリックで降順に反転する', async () => {
    renderPage();
    await screen.findByText('INV-001');

    fireEvent.click(screen.getByText('売上合計'));
    await waitFor(() => expect(invoiceNoOrder()).toEqual(['INV-002', 'INV-001']));

    fireEvent.click(screen.getByText('売上合計'));
    await waitFor(() => expect(invoiceNoOrder()).toEqual(['INV-001', 'INV-002']));
  });

  it('得意先の見出しクリックで文字列昇順に並び替わる', async () => {
    renderPage();
    await screen.findByText('INV-001');

    fireEvent.click(screen.getByText('得意先'));

    await waitFor(() => {
      expect(invoiceNoOrder()).toEqual(['INV-002', 'INV-001']);
    });
  });

  it('請求日の見出しクリックで日付昇順に並び替わる', async () => {
    renderPage();
    await screen.findByText('INV-001');

    fireEvent.click(screen.getByText('請求日'));

    await waitFor(() => {
      expect(invoiceNoOrder()).toEqual(['INV-001', 'INV-002']);
    });
  });
});
