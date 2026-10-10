import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import VoucherEdit from '../VoucherEdit';
import { AppSettingsProvider } from '../../contexts/AppSettingsContext';

const baseVoucher = {
  id: 5, voucher_no: 'S-00005', voucher_type: 'sales', status: 'draft', project_id: null, customer_id: 1,
  voucher_date: '2026-10-10', delivery_date: null, tax_input_type: 'exclusive', consumption_tax_type: '外税/伝票計',
  override_billing_date: null, trade_type: '掛売上', description: '変更前', profit_rate: 0.3, memo: null,
  sales_category_id: null, validity_period: null, subtotal_taxable: 0, tax_amount: 0, total_amount: 0,
  updated_at: '2026-10-10 09:00:00', lines: [], converted_sales: [], access_voucher_id: null,
  access_billed_flag: 0, access_billing_date: null, last_synced_at: null, sync_pending: 0,
};

type PutResult = 'success' | 'stale' | 'error' | 'db-locked';
const requests: Array<{ url: string; method: string; body: any }> = [];

function stubFetch(putResult: PutResult = 'success', serverVoucher = baseVoucher) {
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    requests.push({ url, method, body });
    if (url.endsWith('/customers')) return new Response(JSON.stringify([{ id: 1, name: '得意先A' }]));
    if (url.endsWith('/projects') || url.endsWith('/aggregation-categories') || url.endsWith('/sales-categories')) {
      return new Response('[]');
    }
    if (method === 'PUT' && url.endsWith('/vouchers/5')) {
      await new Promise(resolve => setTimeout(resolve, 20));
      if (putResult === 'stale') {
        return new Response(JSON.stringify({
          error: 'stale_voucher',
          voucher: { ...baseVoucher, description: 'ほかの更新', updated_at: '2026-10-10 10:00:00' },
        }), { status: 409 });
      }
      if (putResult === 'error') return new Response(JSON.stringify({ error: '保存失敗' }), { status: 500 });
      if (putResult === 'db-locked') return new Response(JSON.stringify({ error: 'db locked' }), { status: 500 });
      return new Response(JSON.stringify({ ...baseVoucher, ...body, updated_at: '2026-10-10 09:00:01' }));
    }
    if (url.endsWith('/vouchers/5')) return new Response(JSON.stringify(serverVoucher));
    return new Response('{}');
  }));
}

function renderPage(client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })) {
  const router = createMemoryRouter([
    { path: '/vouchers/:id', element: <VoucherEdit /> },
    { path: '/vouchers', element: <div>伝票一覧</div> },
  ], { initialEntries: ['/vouchers/5'] });
  render(
    <QueryClientProvider client={client}>
      <AppSettingsProvider><RouterProvider router={router} /></AppSettingsProvider>
    </QueryClientProvider>,
  );
  return router;
}

async function changeDescriptionAndClose(value = '入力中の摘要') {
  const user = userEvent.setup();
  await screen.findByText('Beaver作成');
  const description = document.querySelector('input[name="description"]') as HTMLInputElement;
  await user.clear(description);
  await user.type(description, value);
  await user.click(screen.getByRole('button', { name: '閉じる' }));
  return description;
}

beforeEach(() => {
  localStorage.clear();
  requests.length = 0;
  vi.stubGlobal('confirm', vi.fn(() => false));
});

describe('R-0168 離脱前に保存結果を待つ', () => {
  it('摘要変更直後に閉じても保存成功後に確認なしで一覧へ移動する', async () => {
    stubFetch('success');
    renderPage();
    await changeDescriptionAndClose();
    expect(await screen.findByText('伝票一覧')).toBeTruthy();
    expect(confirm).not.toHaveBeenCalled();
    expect(requests.filter(r => r.method === 'PUT' && r.url.endsWith('/vouchers/5'))).toHaveLength(1);
  });

  it('離脱前保存がstaleなら入力を残して競合を表示し、確認も移動もしない', async () => {
    stubFetch('stale');
    renderPage();
    const description = await changeDescriptionAndClose('競合しても残す摘要');
    expect(await screen.findByText(/ほかで更新されています（最終更新: 2026-10-10 10:00:00）/)).toBeTruthy();
    expect(screen.getByRole('button', { name: '再読み込み' })).toBeTruthy();
    expect(description.value).toBe('競合しても残す摘要');
    expect(screen.queryByText('伝票一覧')).toBeNull();
    expect(confirm).not.toHaveBeenCalled();
  });

  it('離脱前保存が500なら保存失敗を表示し、確認も移動もしない', async () => {
    stubFetch('error');
    renderPage();
    await changeDescriptionAndClose();
    expect(await screen.findByText(/保存に失敗しました/)).toBeTruthy();
    expect(screen.queryByText('伝票一覧')).toBeNull();
    expect(confirm).not.toHaveBeenCalled();
  });

  it.each([
    { answer: true, expectedPath: '/vouchers' },
    { answer: false, expectedPath: '/vouchers/5' },
  ])('必須項目が空なら確認し、応答に応じて移動する: $answer', async ({ answer, expectedPath }) => {
    vi.mocked(confirm).mockReturnValue(answer);
    stubFetch('success');
    const router = renderPage();
    const user = userEvent.setup();
    await screen.findByText('得意先A');
    await user.selectOptions(document.querySelector('select[name="customer_id"]') as HTMLSelectElement, '0');
    await user.click(screen.getByRole('button', { name: '閉じる' }));
    await waitFor(() => expect(router.state.location.pathname).toBe(expectedPath));
    expect(confirm).toHaveBeenCalledWith('保存されていない変更があります。破棄して移動しますか？');
  });

  it('staleの状態ではbeforeunloadを阻止する', async () => {
    stubFetch('stale');
    renderPage();
    const user = userEvent.setup();
    await screen.findByText('Beaver作成');
    const description = document.querySelector('input[name="description"]') as HTMLInputElement;
    await user.clear(description);
    await user.type(description, '競合する摘要');
    await user.tab();
    await screen.findByText(/ほかで更新されています/);
    const event = new Event('beforeunload', { cancelable: true });
    fireEvent(window, event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('古いキャッシュではなく再取得した伝票で初期化し、最新の更新日時で保存する', async () => {
    const cachedVoucher = { ...baseVoucher, description: '摘要A', updated_at: '2026-10-10 09:00:00' };
    const serverVoucher = { ...baseVoucher, description: '摘要B', updated_at: '2026-10-10 10:00:00' };
    stubFetch('success', serverVoucher);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 180_000 }, mutations: { retry: false } } });
    client.setQueryData(['vouchers', 5], cachedVoucher);
    renderPage(client);

    const description = document.querySelector('input[name="description"]') as HTMLInputElement;
    await waitFor(() => expect(description.value).toBe('摘要B'));
    expect(requests.filter(r => r.method === 'PUT')).toHaveLength(0);

    const user = userEvent.setup();
    await user.clear(description);
    await user.type(description, '摘要C');
    await user.tab();
    await waitFor(() => expect(requests.filter(r => r.method === 'PUT')).toHaveLength(1));
    expect(requests.find(r => r.method === 'PUT')?.body.expected_updated_at).toBe('2026-10-10 10:00:00');
  });

  it('stale_voucherでは生のAPIエラーを表示しない', async () => {
    stubFetch('stale');
    renderPage();
    await changeDescriptionAndClose();
    await screen.findByText(/ほかで更新されています/);
    expect(document.body.textContent).not.toContain('{"error"');
    expect(document.body.textContent).not.toContain('API error 409');
  });

  it('500の保存エラーはサーバーの短いメッセージだけを表示する', async () => {
    stubFetch('db-locked');
    renderPage();
    await changeDescriptionAndClose();
    expect(await screen.findByText('保存に失敗しました: db locked')).toBeTruthy();
    expect(document.body.textContent).not.toContain('{"error"');
    expect(document.body.textContent).not.toContain('API error 500');
  });
});
