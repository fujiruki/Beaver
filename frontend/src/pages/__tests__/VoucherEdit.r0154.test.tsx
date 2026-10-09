import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import VoucherEdit, { getVoucherEditBlockReason } from '../VoucherEdit';
import { AppSettingsProvider } from '../../contexts/AppSettingsContext';

const baseVoucher = {
  id: 5,
  voucher_no: 'S-00005',
  voucher_type: 'sales',
  status: 'approved',
  project_id: null,
  customer_id: 1,
  voucher_date: '2026-09-01',
  delivery_date: null,
  tax_input_type: 'exclusive',
  consumption_tax_type: '外税/伝票計',
  override_billing_date: null,
  trade_type: '掛売上',
  description: null,
  profit_rate: 0.3,
  memo: null,
  sales_category_id: null,
  validity_period: null,
  subtotal_taxable: 0,
  tax_amount: 0,
  total_amount: 0,
  lines: [],
  converted_sales: [],
  access_voucher_id: null,
  access_billed_flag: 0,
  access_billing_date: null,
  last_synced_at: null,
  sync_pending: 0,
};

const requests: Array<{ url: string; method: string; body: any }> = [];

function stubFetch({ putFails = false, deleteResult = 'voided' } = {}) {
  let saved = false;
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    requests.push({ url, method, body });
    if (url.endsWith('/customers')) return new Response(JSON.stringify([{ id: 1, name: '得意先A' }]));
    if (url.endsWith('/projects')) return new Response('[]');
    if (url.endsWith('/aggregation-categories')) return new Response('[]');
    if (url.endsWith('/sales-categories')) return new Response('[]');
    if (url.endsWith('/vouchers/5') && method === 'PUT') {
      if (putFails) return new Response(JSON.stringify({ error: 'save failed' }), { status: 500 });
      saved = true;
      return new Response(JSON.stringify({ ...baseVoucher, description: body?.description ?? null }));
    }
    if (url.endsWith('/vouchers/5') && method === 'DELETE') return new Response(JSON.stringify({ result: deleteResult }));
    if (url.endsWith('/vouchers/5')) {
      return new Response(JSON.stringify({ ...baseVoucher, is_empty: !saved }));
    }
    return new Response('{}');
  }));
}

function renderVoucher() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AppSettingsProvider>
        <MemoryRouter initialEntries={['/vouchers/5']}>
          <Routes>
            <Route path="/vouchers/:id" element={<VoucherEdit />} />
            <Route path="/vouchers" element={<div>伝票一覧</div>} />
          </Routes>
        </MemoryRouter>
      </AppSettingsProvider>
    </QueryClientProvider>,
  );
}

const indexOf = (method: string) => requests.findIndex(r => r.method === method && r.url.endsWith('/vouchers/5'));
const lastGetIndex = () => requests.map((r, i) => (r.method === 'GET' && r.url.endsWith('/vouchers/5') ? i : -1)).reduce((a, b) => Math.max(a, b), -1);

beforeEach(() => {
  localStorage.clear();
  requests.length = 0;
  vi.stubGlobal('alert', vi.fn());
});

describe('R-0154 追加仕様1: voidの売上は引用済みに数えない', () => {
  it('引用先の売上がvoidだけなら編集不可理由を返さない', () => {
    expect(getVoucherEditBlockReason({
      voucher_type: 'estimate',
      status: 'draft',
      converted_sales: [{ id: 2, voucher_no: 'S-0002', status: 'void', voucher_date: '2026-01-01', quoted_at: null }],
    })).toBeNull();
  });

  it('voidでない売上が1件でもあれば売上に引用済み', () => {
    expect(getVoucherEditBlockReason({
      voucher_type: 'estimate',
      status: 'draft',
      converted_sales: [
        { id: 2, voucher_no: 'S-0002', status: 'void', voucher_date: '2026-01-01', quoted_at: null },
        { id: 3, voucher_no: 'S-0003', status: 'draft', voucher_date: '2026-01-01', quoted_at: null },
      ],
    })).toBe('売上に引用済み');
  });
});

describe('R-0154 追加仕様2: 未保存の入力があれば保存してから取消', () => {
  it('未保存の入力があると先に保存し、保存後の内容で空判定する（中身ありなら理由ダイアログ）', async () => {
    const user = userEvent.setup();
    stubFetch();
    renderVoucher();
    await screen.findByText('Beaver作成');
    await user.type(document.querySelector('input[name="description"]') as HTMLInputElement, '山田様邸');
    await user.click(screen.getByRole('button', { name: '取消' }));

    expect(await screen.findByText('この伝票を取り消します。理由（任意）')).toBeTruthy();
    const putIdx = indexOf('PUT');
    expect(putIdx).toBeGreaterThanOrEqual(0);
    expect(requests[putIdx].body.description).toBe('山田様邸');
    expect(lastGetIndex()).toBeGreaterThan(putIdx);
    expect(indexOf('DELETE')).toBe(-1);

    await user.click(screen.getByRole('button', { name: '取り消す' }));
    await screen.findByText('伝票一覧');
    expect(indexOf('DELETE')).toBeGreaterThan(putIdx);
  });

  it('保存に失敗したら取消しない', async () => {
    const user = userEvent.setup();
    stubFetch({ putFails: true });
    renderVoucher();
    await screen.findByText('Beaver作成');
    await user.type(document.querySelector('input[name="description"]') as HTMLInputElement, '山田様邸');
    const getsBefore = requests.filter(r => r.method === 'GET' && r.url.endsWith('/vouchers/5')).length;
    await user.click(screen.getByRole('button', { name: '取消' }));

    await waitFor(() => expect(indexOf('PUT')).toBeGreaterThanOrEqual(0));
    await waitFor(() => expect((screen.getByRole('button', { name: '取消' }) as HTMLButtonElement).disabled).toBe(false));
    expect(requests.filter(r => r.method === 'GET' && r.url.endsWith('/vouchers/5')).length).toBe(getsBefore);
    expect(indexOf('DELETE')).toBe(-1);
    expect(screen.queryByText('この伝票を取り消します。理由（任意）')).toBeNull();
  });

  it('未保存の入力がなければ保存せずに今の取消フローを行う', async () => {
    const user = userEvent.setup();
    stubFetch();
    renderVoucher();
    await screen.findByText('Beaver作成');
    await user.click(screen.getByRole('button', { name: '取消' }));

    await screen.findByText('伝票一覧');
    expect(indexOf('PUT')).toBe(-1);
    expect(indexOf('DELETE')).toBeGreaterThanOrEqual(0);
  });
});

describe('R-0154: 空の伝票を物理削除したら詳細を再取得しない', () => {
  it('取消の結果が deleted なら、削除後に GET /vouchers/{id} を呼ばない', async () => {
    const user = userEvent.setup();
    stubFetch({ deleteResult: 'deleted' });
    renderVoucher();
    await screen.findByText('Beaver作成');
    await user.click(screen.getByRole('button', { name: '取消' }));

    await screen.findByText('伝票一覧');
    await new Promise(r => setTimeout(r, 50));
    const deleteIdx = indexOf('DELETE');
    expect(deleteIdx).toBeGreaterThanOrEqual(0);
    expect(lastGetIndex()).toBeLessThan(deleteIdx);
  });
});
