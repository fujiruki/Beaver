import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import VoucherList from '../VoucherList';

const CUSTOMERS = [
  { id: 1, name: '田中商店', name_kana: null, tel: null, mobile: null, address1: null, address2: null, memo: null },
  { id: 2, name: '鈴木製作所', name_kana: null, tel: null, mobile: null, address1: null, address2: null, memo: null },
];

const ALL_VOUCHERS = [
  { id: 1, voucher_no: 'E00001', voucher_type: 'estimate', status: 'draft', customer_id: 1,
    customer_name: '田中商店', project_name: '田中邸', description: '玄関ドア', voucher_date: '2026-01-01', total_amount: 100000 },
  { id: 2, voucher_no: 'S00001', voucher_type: 'sales', status: 'billed', customer_id: 2,
    customer_name: '鈴木製作所', project_name: '鈴木邸', description: '窓サッシ', voucher_date: '2026-02-01', total_amount: 200000 },
];

let requestedUrls: string[] = [];

beforeEach(() => {
  localStorage.clear();
  requestedUrls = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const u = new URL(url, 'http://localhost');
    if (u.pathname.endsWith('/customers')) {
      return new Response(JSON.stringify(CUSTOMERS), { status: 200 });
    }
    if (u.pathname.endsWith('/projects')) {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    requestedUrls.push(url);
    return new Response(JSON.stringify({
      data: ALL_VOUCHERS,
      meta: { total: ALL_VOUCHERS.length, page: 1, per_page: 50, last_page: 2 },
    }), { status: 200 });
  }));
});

function renderPage(initialEntries?: string[]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={initialEntries ?? ['/vouchers']}>
        <VoucherList />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('VoucherList URL状態保持 (R-0096 Phase1)', () => {
  it('検索はIME確定後にqへ反映され、既存フィルタと併用できる', async () => {
    renderPage(['/vouchers?voucher_type=estimate&customer_id=1']);
    await waitFor(() => expect(requestedUrls.length).toBeGreaterThan(0));
    const input = await screen.findByPlaceholderText('伝票番号・得意先・案件・摘要で検索');
    const callsBefore = requestedUrls.length;
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: 'さくら' } });
    expect(requestedUrls.length).toBe(callsBefore);
    fireEvent.compositionEnd(input, { data: 'さくら' });
    await waitFor(() => {
      const last = new URL(requestedUrls[requestedUrls.length - 1], 'http://localhost');
      expect(last.searchParams.get('q')).toBe('さくら');
      expect(last.searchParams.get('voucher_type')).toBe('estimate');
      expect(last.searchParams.get('customer_id')).toBe('1');
    });
  });

  it('URLのqを初期表示とAPIリクエストへ復元する', async () => {
    renderPage(['/vouchers?q=現場メモ&status=draft']);
    expect((await screen.findByDisplayValue('現場メモ') as HTMLInputElement).value).toBe('現場メモ');
    await waitFor(() => {
      const last = new URL(requestedUrls[requestedUrls.length - 1], 'http://localhost');
      expect(last.searchParams.get('q')).toBe('現場メモ');
      expect(last.searchParams.get('status')).toBe('draft');
    });
  });
  it('種別フィルタを変更するとバックエンドリクエストのvoucher_typeパラメータに反映される', async () => {
    renderPage();
    await waitFor(() => expect(requestedUrls.length).toBeGreaterThan(0));

    const [typeSelect] = screen.getAllByRole('combobox') as HTMLSelectElement[];
    fireEvent.change(typeSelect, { target: { value: 'estimate' } });

    await waitFor(() => {
      const last = new URL(requestedUrls[requestedUrls.length - 1], 'http://localhost');
      expect(last.searchParams.get('voucher_type')).toBe('estimate');
    });
  });

  it('ステータスフィルタを変更するとURLのstatusパラメータに反映される', async () => {
    renderPage();
    await waitFor(() => expect(requestedUrls.length).toBeGreaterThan(0));

    const [, statusSelect] = screen.getAllByRole('combobox') as HTMLSelectElement[];
    fireEvent.change(statusSelect, { target: { value: 'billed' } });

    await waitFor(() => {
      const last = new URL(requestedUrls[requestedUrls.length - 1], 'http://localhost');
      expect(last.searchParams.get('status')).toBe('billed');
    });
  });

  it('列見出しクリックでソートするとURLのsort/orderが更新される', async () => {
    renderPage();
    await waitFor(() => expect(requestedUrls.length).toBeGreaterThan(0));

    fireEvent.click(await screen.findByRole('columnheader', { name: '得意先' }));

    await waitFor(() => {
      const last = new URL(requestedUrls[requestedUrls.length - 1], 'http://localhost');
      expect(last.searchParams.get('sort')).toBe('customer_name');
      expect(last.searchParams.get('order')).toBe('asc');
    });
  });

  it('URLにvoucher_type/status/sort/order/customer_idが既に入っている状態から表示すると、その状態が復元される', async () => {
    renderPage(['/vouchers?voucher_type=sales&status=billed&sort=total_amount&order=desc&customer_id=2']);
    await waitFor(() => expect(requestedUrls.length).toBeGreaterThan(0));

    const last = new URL(requestedUrls[requestedUrls.length - 1], 'http://localhost');
    expect(last.searchParams.get('voucher_type')).toBe('sales');
    expect(last.searchParams.get('status')).toBe('billed');
    expect(last.searchParams.get('sort')).toBe('total_amount');
    expect(last.searchParams.get('order')).toBe('desc');
    expect(last.searchParams.get('customer_id')).toBe('2');
  });
});
