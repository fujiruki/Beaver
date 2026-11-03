import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import InvoiceDetail from '../InvoiceDetail';
import { paymentTypeOptions } from '../../lib/paymentTypes';

const invoice = {
  id: 3, invoice_no: 'I-3', customer_id: 1, customer_name: '得意先', billing_name_print: '得意先',
  invoice_date: '2026-01-01', cutoff_date: '2026-01-01', billing_date: '2026-01-01',
  carry_forward: 0, sales_total: 1000, tax_total: 100, payment_received: 0,
  invoice_total: 1100, next_carry_forward: 1100, vouchers: [], payments: [],
};

describe('R-0239 追記2 入金の種類', () => {
  it('選択肢は Access の一覧の順で、初期値は藤田建具店の口座', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const u = new URL(url, 'http://localhost');
      if (u.pathname.endsWith('/settings/billing-edit-enabled')) {
        return new Response(JSON.stringify({ billing_edit_enabled: true }), { status: 200 });
      }
      if (u.pathname.endsWith('/customers') || u.pathname.endsWith('/vouchers')) {
        return new Response('[]', { status: 200 });
      }
      return new Response(JSON.stringify(invoice), { status: 200 });
    }));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/invoices/3']}>
          <Routes><Route path="/invoices/:id" element={<InvoiceDetail />} /></Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: '+ 入金登録' }));
    const select = (await screen.findByText('入金種別')).parentElement!.querySelector('select')!;
    expect(select.value).toBe('伊予銀行　長浜支店　藤田建具店');
    expect(Array.from(select.options).map(o => o.value)).toEqual([
      '現金売上', '伊予銀行　長浜支店　宗三', '愛媛たいき農協　大和支所', '小切手', 'その他', '値引き',
      '伊予銀行　長浜支店　藤田建具店',
    ]);
  });

  it('一覧に無い既存の値は選択肢の先頭に残す', () => {
    expect(paymentTypeOptions('振込')[0]).toBe('振込');
    expect(paymentTypeOptions('振込')).toHaveLength(8);
    expect(paymentTypeOptions('小切手')).toHaveLength(7);
    expect(paymentTypeOptions(null)).toHaveLength(7);
  });
});
