import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import VoucherEdit from '../VoucherEdit';
import { AppSettingsProvider } from '../../contexts/AppSettingsContext';

const baseVoucher = {
  id: 5, voucher_no: 'S-00005', voucher_type: 'sales', status: 'draft', project_id: 48, customer_id: 809,
  voucher_date: '2026-10-10', delivery_date: null, tax_input_type: 'exclusive', consumption_tax_type: '外税/伝票計',
  override_billing_date: null, trade_type: '掛売上', description: '既存摘要', profit_rate: 0.3, memo: null,
  sales_category_id: 1, validity_period: null, subtotal_taxable: 0, tax_amount: 0, total_amount: 0, lines: [],
  converted_sales: [], access_voucher_id: null, access_billed_flag: 0, access_billing_date: null,
  last_synced_at: null, sync_pending: 0, updated_at: '2026-10-10 09:00:00',
};

const requests: Array<{ url: string; method: string; body: any }> = [];

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

function stubFetch({ delayOptions = false, customerError = false, missingCustomer = false } = {}) {
  const optionsGate = deferred<void>();
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    requests.push({ url, method, body });

    if (url.endsWith('/vouchers/5') && method === 'GET') return new Response(JSON.stringify(baseVoucher));
    if (url.endsWith('/customers')) {
      if (delayOptions) await optionsGate.promise;
      if (customerError) return new Response(JSON.stringify({ error: '取得失敗' }), { status: 500 });
      return new Response(JSON.stringify(missingCustomer ? [] : [{ id: 809, name: '得意先809' }]));
    }
    if (url.endsWith('/projects')) {
      if (delayOptions) await optionsGate.promise;
      return new Response(JSON.stringify([{ id: 48, name: '案件48', customer_id: 809 }]));
    }
    if (url.endsWith('/sales-categories')) {
      if (delayOptions) await optionsGate.promise;
      return new Response(JSON.stringify([{ id: 1, name: '売上種別1', sort_order: 1, is_active: 1 }]));
    }
    if (url.endsWith('/aggregation-categories')) return new Response('[]');
    if (url.endsWith('/vouchers/5') && method === 'PUT') return new Response(JSON.stringify({ ...baseVoucher, ...body }));
    return new Response('{}');
  }));
  return { releaseOptions: () => optionsGate.resolve() };
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AppSettingsProvider>
        <MemoryRouter initialEntries={['/vouchers/5']}>
          <Routes><Route path="/vouchers/:id" element={<VoucherEdit />} /></Routes>
        </MemoryRouter>
      </AppSettingsProvider>
    </QueryClientProvider>,
  );
}

const getSelect = (name: string) => document.querySelector(`select[name="${name}"]`) as HTMLSelectElement;
const getDescription = () => document.querySelector('input[name="description"]') as HTMLInputElement;
const putRequests = () => requests.filter(request => request.method === 'PUT' && request.url.endsWith('/vouchers/5'));

beforeEach(() => {
  localStorage.clear();
  requests.length = 0;
});

describe('R-0161 選択肢を待って伝票フォームを初期化する', () => {
  it('選択肢が遅れて届いたあとに伝票の得意先・案件・売上種別を表示する', async () => {
    const { releaseOptions } = stubFetch({ delayOptions: true });
    renderPage();
    await screen.findByText('Beaver作成');
    expect(getSelect('customer_id').disabled).toBe(true);

    releaseOptions();

    await waitFor(() => {
      expect(getSelect('customer_id').value).toBe('809');
      expect(getSelect('project_id').value).toBe('48');
      expect(getSelect('sales_category_id').value).toBe('1');
    });
  });

  it('選択肢が届く前は保存せず、届いたあとのPUTでも選択値を保つ', async () => {
    const user = userEvent.setup();
    const { releaseOptions } = stubFetch({ delayOptions: true });
    renderPage();
    await screen.findByText('Beaver作成');
    expect(getDescription().disabled).toBe(true);
    expect(putRequests()).toHaveLength(0);

    releaseOptions();
    await waitFor(() => expect(getDescription().disabled).toBe(false));
    await user.clear(getDescription());
    await user.type(getDescription(), '変更後摘要');
    await user.tab();

    await waitFor(() => expect(putRequests()).toHaveLength(1));
    expect(putRequests()[0].body).toMatchObject({ customer_id: 809, project_id: 48, sales_category_id: 1 });
  });

  it('選択肢の取得失敗時は案内を表示し、フォーム変更もPUTも許可しない', async () => {
    const user = userEvent.setup();
    stubFetch({ customerError: true });
    renderPage();

    expect(await screen.findByText('選択肢を読み込めませんでした。再読み込みしてください')).toBeTruthy();
    expect(getDescription().disabled).toBe(true);
    await user.type(getDescription(), '保存されない摘要');
    await user.tab();
    expect(putRequests()).toHaveLength(0);
  });

  it('一覧にない得意先IDを選択肢として表示し、PUTでもその値を保つ', async () => {
    const user = userEvent.setup();
    stubFetch({ missingCustomer: true });
    renderPage();

    expect(await screen.findByRole('option', { name: '（一覧にない得意先 id=809）' })).toBeTruthy();
    expect(getSelect('customer_id').value).toBe('809');
    await user.clear(getDescription());
    await user.type(getDescription(), '一覧外でも保持');
    await user.tab();

    await waitFor(() => expect(putRequests()).toHaveLength(1));
    expect(putRequests()[0].body.customer_id).toBe(809);
  });
});
