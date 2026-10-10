import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import VoucherEdit from '../VoucherEdit';
import { AppSettingsProvider } from '../../contexts/AppSettingsContext';

const baseVoucher = {
  id: 5, voucher_no: 'S-00005', voucher_type: 'sales', status: 'draft', project_id: null, customer_id: 1,
  voucher_date: '2026-10-10', delivery_date: null, tax_input_type: 'exclusive', consumption_tax_type: '外税/伝票計',
  override_billing_date: null, trade_type: '掛売上', description: null, profit_rate: 0.3, memo: null,
  sales_category_id: null, validity_period: null, subtotal_taxable: 0, tax_amount: 0, total_amount: 0, lines: [],
  converted_sales: [], access_voucher_id: null, access_billed_flag: 0, access_billing_date: null,
  last_synced_at: null, sync_pending: 0,
};

const requests: Array<{ url: string; method: string; body: any }> = [];

function stubFetch({ voucher = baseVoucher, failFirstPut = false, holdPut = false } = {}) {
  let putCount = 0;
  let releasePut: (() => void) | undefined;
  const putGate = new Promise<void>(resolve => { releasePut = resolve; });
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    requests.push({ url, method, body });
    if (url.endsWith('/customers')) return new Response(JSON.stringify([{ id: 1, name: '得意先A' }, { id: 2, name: '得意先B' }]));
    if (url.endsWith('/projects') || url.endsWith('/aggregation-categories') || url.endsWith('/sales-categories')) return new Response('[]');
    if (method === 'PUT' && url.endsWith('/vouchers/5')) {
      putCount += 1;
      if (holdPut) await putGate;
      if (failFirstPut && putCount === 1) return new Response(JSON.stringify({ error: '一時的な障害' }), { status: 500 });
      return new Response(JSON.stringify({ ...voucher, ...body }));
    }
    if (method === 'POST' && url.endsWith('/vouchers')) return new Response(JSON.stringify({ ...baseVoucher, id: 77, ...body }), { status: 201 });
    if (url.endsWith('/vouchers/5')) return new Response(JSON.stringify(voucher));
    return new Response('{}');
  }));
  return { releasePut: () => releasePut?.() };
}

function renderPage(path = '/vouchers/5') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const router = createMemoryRouter([
    { path: '/vouchers/new', element: <VoucherEdit /> },
    { path: '/vouchers/:id', element: <VoucherEdit /> },
    { path: '/vouchers', element: <div>伝票一覧</div> },
    { path: '/done/:id', element: <div>保存後</div> },
  ], { initialEntries: ['/vouchers', path], initialIndex: 1 });
  render(
    <QueryClientProvider client={client}>
      <AppSettingsProvider><RouterProvider router={router} /></AppSettingsProvider>
    </QueryClientProvider>,
  );
  return router;
}

const putRequests = () => requests.filter(r => r.method === 'PUT' && r.url.endsWith('/vouchers/5'));

beforeEach(() => {
  localStorage.clear();
  requests.length = 0;
  vi.stubGlobal('confirm', vi.fn(() => false));
});

describe('R-0164 伝票ヘッダーの自動保存と離脱警告', () => {
  it('摘要はフォーカスを外すと1回保存され、保存済み時刻を表示する', async () => {
    const user = userEvent.setup();
    stubFetch();
    renderPage();
    await screen.findByText('Beaver作成');
    const description = document.querySelector('input[name="description"]') as HTMLInputElement;
    await user.type(description, '山田様邸');
    await user.tab();
    await waitFor(() => expect(putRequests()).toHaveLength(1));
    expect(putRequests()[0].body.description).toBe('山田様邸');
    expect(await screen.findByText(/保存しました \d{2}:\d{2}/)).toBeTruthy();
  });

  it('得意先を選び直すとその時点で保存する', async () => {
    const user = userEvent.setup();
    stubFetch();
    renderPage();
    await screen.findByText('得意先B');
    await user.selectOptions(document.querySelector('select[name="customer_id"]') as HTMLSelectElement, '2');
    await waitFor(() => expect(putRequests()).toHaveLength(1));
    expect(putRequests()[0].body.customer_id).toBe(2);
  });

  it('伝票日付を空にすると保存せず未保存状態を表示する', async () => {
    const user = userEvent.setup();
    stubFetch();
    renderPage();
    await screen.findByText('Beaver作成');
    const date = document.querySelector('input[name="voucher_date"]') as HTMLInputElement;
    await user.clear(date);
    await waitFor(() => expect(screen.getByText('未保存の変更があります')).toBeTruthy());
    expect(putRequests()).toHaveLength(0);
    expect(screen.getByText('必須です')).toBeTruthy();
  });

  it('保存失敗を表示し、再試行で保存できる', async () => {
    const user = userEvent.setup();
    stubFetch({ failFirstPut: true });
    renderPage();
    await screen.findByText('Beaver作成');
    const description = document.querySelector('input[name="description"]') as HTMLInputElement;
    await user.type(description, '再試行対象');
    await user.tab();
    expect(await screen.findByText(/保存に失敗しました/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '再試行' }));
    await waitFor(() => expect(putRequests()).toHaveLength(2));
    expect(await screen.findByText(/保存しました \d{2}:\d{2}/)).toBeTruthy();
  });

  it('保存中・失敗・未保存では閉じる時に確認し、留まるを選ぶと残る', async () => {
    const user = userEvent.setup();
    const { releasePut } = stubFetch({ holdPut: true });
    renderPage();
    await screen.findByText('Beaver作成');
    const description = document.querySelector('input[name="description"]') as HTMLInputElement;
    await user.type(description, '保存中');
    await user.tab();
    await screen.findByText('保存中…');
    await user.click(screen.getByRole('button', { name: '閉じる' }));
    expect(confirm).toHaveBeenCalledWith('保存されていない変更があります。破棄して移動しますか？');
    expect(screen.getByText('Beaver作成')).toBeTruthy();
    releasePut();
  });

  it('すべて保存済みなら閉じる時に確認せず離れる', async () => {
    const user = userEvent.setup();
    stubFetch();
    renderPage();
    await screen.findByText('Beaver作成');
    await user.click(screen.getByRole('button', { name: '閉じる' }));
    expect(await screen.findByText('伝票一覧')).toBeTruthy();
    expect(confirm).not.toHaveBeenCalled();
  });

  it('編集できない伝票では変更操作ができず保存も送られない', async () => {
    stubFetch({ voucher: { ...baseVoucher, status: 'billed' } });
    renderPage();
    await screen.findByText('Beaver作成');
    expect((document.querySelector('input[name="description"]') as HTMLInputElement).disabled).toBe(true);
    expect(putRequests()).toHaveLength(0);
  });

  it('新規画面は保存ボタンで作成でき、入力後に閉じると確認する', async () => {
    const user = userEvent.setup();
    stubFetch();
    renderPage('/vouchers/new');
    await screen.findByText('得意先A');
    await user.type(document.querySelector('input[name="description"]') as HTMLInputElement, '新規入力');
    await user.click(screen.getByRole('button', { name: '閉じる' }));
    expect(confirm).toHaveBeenCalledWith('保存されていない変更があります。破棄して移動しますか？');
    await user.selectOptions(document.querySelector('select[name="customer_id"]') as HTMLSelectElement, '1');
    await user.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(requests.some(r => r.method === 'POST' && r.url.endsWith('/vouchers'))).toBe(true));
  });

  it('既存伝票では保存・キャンセルボタンを表示しない', async () => {
    stubFetch();
    renderPage();
    await screen.findByText('Beaver作成');
    expect(screen.queryByRole('button', { name: '保存' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'キャンセル' })).toBeNull();
  });
});
