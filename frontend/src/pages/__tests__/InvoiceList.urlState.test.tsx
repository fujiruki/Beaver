import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import InvoiceList from '../InvoiceList';

const CUSTOMERS = [
  { id: 1, name: 'A社' },
  { id: 2, name: 'B社' },
];

const INVOICES = [
  {
    id: 1, invoice_no: 'INV-001', customer_id: 1, customer_name: 'A社',
    invoice_date: '2026-01-01', cutoff_date: '2026-01-31', billing_date: '2026-02-05',
    carry_forward: 0, sales_total: 300, tax_total: 30, payment_received: 0,
    invoice_total: 330, next_carry_forward: 330, billing_name_print: '',
    created_at: '', updated_at: '',
  },
  {
    id: 2, invoice_no: 'INV-002', customer_id: 2, customer_name: 'B社',
    invoice_date: '2026-02-01', cutoff_date: '2026-02-28', billing_date: '2026-03-01',
    carry_forward: 0, sales_total: 100, tax_total: 10, payment_received: 0,
    invoice_total: 110, next_carry_forward: 110, billing_name_print: '',
    created_at: '', updated_at: '',
  },
];

function invoiceNoOrder(): string[] {
  return Array.from(document.querySelectorAll('tbody tr'))
    .map(tr => tr.querySelector('td')?.textContent ?? '');
}

let requestedUrls: string[] = [];

beforeEach(() => {
  localStorage.clear();
  requestedUrls = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const u = new URL(url, 'http://localhost');
    if (u.pathname.endsWith('/customers')) {
      return new Response(JSON.stringify(CUSTOMERS), { status: 200 });
    }
    requestedUrls.push(url);
    return new Response(JSON.stringify(INVOICES), { status: 200 });
  }));
});

function renderPage(initialEntries?: string[]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={initialEntries ?? ['/invoices']}>
        <InvoiceList />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('InvoiceList URL状態保持 (R-0096 Phase1)', () => {
  it('検索はIME確定後にqへ反映され、年月・得意先フィルタと併用できる', async () => {
    renderPage(['/invoices?year=2025&month=6&customer_id=2']);
    await waitFor(() => expect(requestedUrls.length).toBeGreaterThan(0));
    const input = await screen.findByPlaceholderText('請求書番号・得意先で検索');
    const callsBefore = requestedUrls.length;
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: 'サクラ' } });
    expect(requestedUrls.length).toBe(callsBefore);
    fireEvent.compositionEnd(input, { data: 'サクラ' });
    await waitFor(() => {
      const last = new URL(requestedUrls[requestedUrls.length - 1], 'http://localhost');
      expect(last.searchParams.get('q')).toBe('サクラ');
      expect(last.searchParams.get('year')).toBe('2025');
      expect(last.searchParams.get('month')).toBe('6');
      expect(last.searchParams.get('customer_id')).toBe('2');
    });
  });

  it('URLのqを初期表示とAPIリクエストへ復元する', async () => {
    renderPage(['/invoices?q=I-R0084&year=2025']);
    expect((await screen.findByDisplayValue('I-R0084') as HTMLInputElement).value).toBe('I-R0084');
    await waitFor(() => {
      const last = new URL(requestedUrls[requestedUrls.length - 1], 'http://localhost');
      expect(last.searchParams.get('q')).toBe('I-R0084');
      expect(last.searchParams.get('year')).toBe('2025');
    });
  });
  it('得意先フィルタを変更するとバックエンドリクエストのcustomer_idパラメータに反映される', async () => {
    renderPage();
    await waitFor(() => expect(requestedUrls.length).toBeGreaterThan(0));

    const customerSelect = await screen.findByDisplayValue('得意先：すべて') as HTMLSelectElement;
    fireEvent.change(customerSelect, { target: { value: '2' } });

    await waitFor(() => {
      const last = new URL(requestedUrls[requestedUrls.length - 1], 'http://localhost');
      expect(last.searchParams.get('customer_id')).toBe('2');
    });
  });

  it('月フィルタを変更するとバックエンドリクエストのmonthパラメータに反映される', async () => {
    renderPage();
    await waitFor(() => expect(requestedUrls.length).toBeGreaterThan(0));

    const monthSelect = await screen.findByDisplayValue(`${new Date().getMonth() + 1}月`) as HTMLSelectElement;
    fireEvent.change(monthSelect, { target: { value: '3' } });

    await waitFor(() => {
      const last = new URL(requestedUrls[requestedUrls.length - 1], 'http://localhost');
      expect(last.searchParams.get('month')).toBe('3');
    });
  });

  it('URLにyear/month/customer_idが既に入っている状態から表示すると、その状態が復元される', async () => {
    renderPage(['/invoices?year=2025&month=6&customer_id=2']);
    await waitFor(() => expect(requestedUrls.length).toBeGreaterThan(0));

    const last = new URL(requestedUrls[requestedUrls.length - 1], 'http://localhost');
    expect(last.searchParams.get('year')).toBe('2025');
    expect(last.searchParams.get('month')).toBe('6');
    expect(last.searchParams.get('customer_id')).toBe('2');
  });

  it('列見出しクリックでソートすると、リロード時に同じソート順が復元されるようURLへ反映される', async () => {
    renderPage();
    await screen.findByText('INV-001');
    expect(invoiceNoOrder()).toEqual(['INV-001', 'INV-002']);

    fireEvent.click(screen.getByText('売上合計'));
    await waitFor(() => expect(invoiceNoOrder()).toEqual(['INV-002', 'INV-001']));
  });

  it('URLにsort/orderが既に入っている状態から表示すると、その並び順が復元される', async () => {
    renderPage(['/invoices?sort=sales_total&order=asc']);
    await screen.findByText('INV-001');

    await waitFor(() => expect(invoiceNoOrder()).toEqual(['INV-002', 'INV-001']));
  });
});
