import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import VoucherEdit from '../VoucherEdit';
import { AppSettingsProvider } from '../../contexts/AppSettingsContext';

const voucher = {
  id: 236, voucher_no: 'E-00236', voucher_type: 'estimate', status: 'draft',
  project_id: null, customer_id: 1, voucher_date: '2026-11-02', due_date: null, delivery_date: null,
  tax_input_type: 'exclusive', consumption_tax_type: '外税・伝票計', override_billing_date: null,
  trade_type: '掛売上', description: '玄関工事', profit_rate: 0.3, memo: '既存の説明', hidden_note: '既存の記録',
  sales_category_id: null, validity_period: null, subtotal_taxable: 0, tax_amount: 0, total_amount: 0,
  lines: [], converted_sales: [], access_voucher_id: null, access_billed_flag: 0,
  access_billing_date: null, last_synced_at: null, sync_pending: 0, updated_at: '2026-11-02 10:00:00',
};

const puts: Array<Record<string, unknown>> = [];

function renderPage(readOnly = false) {
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    if (method === 'PUT' && url.endsWith('/vouchers/236')) {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      puts.push(body);
      return new Response(JSON.stringify({ ...voucher, ...body, updated_at: '2026-11-02 10:00:01' }));
    }
    if (url.endsWith('/customers')) return new Response(JSON.stringify([{ id: 1, name: '得意先A' }]));
    if (url.endsWith('/projects') || url.endsWith('/aggregation-categories') || url.endsWith('/sales-categories')) {
      return new Response('[]');
    }
    if (url.endsWith('/vouchers/236')) return new Response(JSON.stringify(voucher));
    return new Response('{}');
  }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AppSettingsProvider>
        <MemoryRouter initialEntries={[`/vouchers/236${readOnly ? '?readonly=1' : ''}`]}>
          <Routes><Route path="/vouchers/:id" element={<VoucherEdit />} /></Routes>
        </MemoryRouter>
      </AppSettingsProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  puts.length = 0;
  vi.restoreAllMocks();
});

describe('R-0241 伝票の非表示記録', () => {
  it('説明の下の複数行欄へ表示し、欄から出るとhidden_noteをPUTする', async () => {
    renderPage();
    const note = await screen.findByRole('textbox', { name: '非表示記録' }) as HTMLTextAreaElement;
    const memo = screen.getByRole('textbox', { name: '説明' });

    expect(memo.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(note.value).toBe('既存の記録');
    expect(screen.getByText('帳票に出ない')).toBeTruthy();
    fireEvent.change(note, { target: { value: '値引き余地あり' } });
    fireEvent.blur(note);

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0].hidden_note).toBe('値引き余地あり');
  });

  it('読み取り専用の伝票では入力できない', async () => {
    renderPage(true);
    const note = await screen.findByRole('textbox', { name: '非表示記録' }) as HTMLTextAreaElement;

    expect(note.disabled).toBe(true);
    expect(note.value).toBe('既存の記録');
  });

  it('印刷では隠す印が付く', async () => {
    renderPage();
    const note = await screen.findByRole('textbox', { name: '非表示記録' });

    expect(note.closest('.no-print')).not.toBeNull();
  });
});
