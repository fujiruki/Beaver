import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import VoucherEdit from '../VoucherEdit';
import { AppSettingsProvider } from '../../contexts/AppSettingsContext';

const baseLine = {
  id: 51, voucher_id: 5, line_no: 1, line_type: 'normal', location_no: null, location_name: null,
  tategu_item_id: null, source_catalog_item_id: null, item_name: '既存明細', quantity: 1,
  cost_body: 0, cost_hardware: 0, cost_glass: 0, cost_factory_hours: 0, cost_site_hours: 0,
  cost_labor_rate: 0, snapshot_loaded_at: null, price_body: 0, price_hardware: 0, price_glass: 0,
  line_total: 0, tax_category: 'taxable', memo: null, costs: [], prices: [],
};

const baseVoucher = {
  id: 5, voucher_no: 'S-00005', voucher_type: 'sales', status: 'draft', project_id: null, customer_id: 1,
  voucher_date: '2026-10-10', delivery_date: null, tax_input_type: 'exclusive', consumption_tax_type: '外税/伝票計',
  override_billing_date: null, trade_type: '掛売上', description: 'サーバー初期値', profit_rate: 0.3, memo: null,
  sales_category_id: null, validity_period: null, subtotal_taxable: 0, tax_amount: 0, total_amount: 0,
  updated_at: '2026-10-10 09:00:00', lines: [baseLine], converted_sales: [], access_voucher_id: null,
  access_billed_flag: 0, access_billing_date: null, last_synced_at: null, sync_pending: 0,
};

type RequestRecord = { url: string; method: string; body: any };
const requests: RequestRecord[] = [];

function commonResponse(url: string) {
  if (url.endsWith('/customers')) return new Response(JSON.stringify([{ id: 1, name: '得意先A' }]));
  if (url.endsWith('/projects') || url.endsWith('/aggregation-categories') || url.endsWith('/sales-categories')) return new Response('[]');
  return null;
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const router = createMemoryRouter([
    { path: '/vouchers/:id', element: <VoucherEdit /> },
    { path: '/vouchers', element: <div>伝票一覧</div> },
  ], { initialEntries: ['/vouchers/5'] });
  render(
    <QueryClientProvider client={client}>
      <AppSettingsProvider><RouterProvider router={router} /></AppSettingsProvider>
    </QueryClientProvider>,
  );
}

const voucherWrites = () => requests.filter(r => r.method !== 'GET' && r.url.includes('/vouchers/5'));

beforeEach(() => {
  localStorage.clear();
  requests.length = 0;
  vi.stubGlobal('confirm', vi.fn(() => false));
});

describe('R-0166 伝票画面の楽観的ロック', () => {
  it('ヘッダーを2回保存すると応答のupdated_atを次のexpected_updated_atに使う', async () => {
    let updatedAt = baseVoucher.updated_at;
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      requests.push({ url, method, body });
      const common = commonResponse(url);
      if (common) return common;
      if (method === 'PUT' && url.endsWith('/vouchers/5')) {
        updatedAt = updatedAt.endsWith('00') ? '2026-10-10 09:00:01' : '2026-10-10 09:00:02';
        return new Response(JSON.stringify({ ...baseVoucher, ...body, updated_at: updatedAt }));
      }
      if (url.endsWith('/vouchers/5')) return new Response(JSON.stringify(baseVoucher));
      return new Response('{}');
    }));
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Beaver作成');
    const description = document.querySelector('input[name="description"]') as HTMLInputElement;
    await user.clear(description);
    await user.type(description, '1回目');
    await user.tab();
    await waitFor(() => expect(voucherWrites()).toHaveLength(1));
    await user.click(description);
    await user.type(description, 'と2回目');
    await user.tab();
    await waitFor(() => expect(voucherWrites()).toHaveLength(2));
    expect(voucherWrites()[0].body.expected_updated_at).toBe('2026-10-10 09:00:00');
    expect(voucherWrites()[1].body.expected_updated_at).toBe('2026-10-10 09:00:01');
  });

  it('ヘッダー保存中の明細保存を待たせ、更新後の時刻で順番に送る', async () => {
    let releaseHeader!: () => void;
    const headerGate = new Promise<void>(resolve => { releaseHeader = resolve; });
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      requests.push({ url, method, body });
      const common = commonResponse(url);
      if (common) return common;
      if (method === 'PUT' && url.endsWith('/vouchers/5')) {
        await headerGate;
        return new Response(JSON.stringify({ ...baseVoucher, ...body, updated_at: '2026-10-10 09:00:01' }));
      }
      if (method === 'PUT' && url.endsWith('/vouchers/5/lines/51')) {
        return new Response(JSON.stringify({ ...baseLine, ...body, voucher_updated_at: '2026-10-10 09:00:02' }));
      }
      if (url.endsWith('/vouchers/5')) return new Response(JSON.stringify(baseVoucher));
      return new Response('{}');
    }));
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Beaver作成');
    const description = document.querySelector('input[name="description"]') as HTMLInputElement;
    await user.type(description, '変更');
    await user.tab();
    await waitFor(() => expect(voucherWrites()).toHaveLength(1));
    const itemName = document.querySelector('input[name="lines.0.item_name"]') as HTMLInputElement;
    await user.type(itemName, '追記');
    await user.tab();
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(voucherWrites()).toHaveLength(1);
    releaseHeader();
    await waitFor(() => expect(voucherWrites()).toHaveLength(2));
    expect(voucherWrites()[1].url).toContain('/lines/51');
    expect(voucherWrites()[1].body.expected_updated_at).toBe('2026-10-10 09:00:01');
  });

  it('409後は競合表示を出して自動保存を止め、入力値を残す', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      requests.push({ url, method, body });
      const common = commonResponse(url);
      if (common) return common;
      if (method === 'PUT' && url.endsWith('/vouchers/5')) {
        return new Response(JSON.stringify({
          error: 'stale_voucher',
          voucher: { ...baseVoucher, description: 'ほかの更新', updated_at: '2026-10-10 10:00:00' },
        }), { status: 409 });
      }
      if (url.endsWith('/vouchers/5')) return new Response(JSON.stringify(baseVoucher));
      return new Response('{}');
    }));
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Beaver作成');
    const description = document.querySelector('input[name="description"]') as HTMLInputElement;
    await user.clear(description);
    await user.type(description, '入力中の値');
    await user.tab();
    expect(await screen.findByText(/ほかで更新されています（最終更新: 2026-10-10 10:00:00）/)).toBeTruthy();
    expect(screen.getByRole('button', { name: '再読み込み' })).toBeTruthy();
    expect(description.value).toBe('入力中の値');
    await user.click(description);
    await user.type(description, 'を保持');
    await user.tab();
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(voucherWrites()).toHaveLength(1);
  });

  it('再読み込みで最新値をフォームへ反映し、自動保存を再開する', async () => {
    let getCount = 0;
    let putCount = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      requests.push({ url, method, body });
      const common = commonResponse(url);
      if (common) return common;
      if (method === 'PUT' && url.endsWith('/vouchers/5')) {
        putCount += 1;
        if (putCount === 1) {
          return new Response(JSON.stringify({
            error: 'stale_voucher',
            voucher: { ...baseVoucher, description: 'サーバー最新値', updated_at: '2026-10-10 10:00:00' },
          }), { status: 409 });
        }
        return new Response(JSON.stringify({ ...baseVoucher, ...body, updated_at: '2026-10-10 10:00:01' }));
      }
      if (url.endsWith('/vouchers/5')) {
        getCount += 1;
        return new Response(JSON.stringify(getCount === 1 ? baseVoucher : {
          ...baseVoucher, description: 'サーバー最新値', updated_at: '2026-10-10 10:00:00',
        }));
      }
      return new Response('{}');
    }));
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Beaver作成');
    const description = document.querySelector('input[name="description"]') as HTMLInputElement;
    await user.clear(description);
    await user.type(description, '競合する入力');
    await user.tab();
    await screen.findByText(/ほかで更新されています/);
    await user.click(screen.getByRole('button', { name: '再読み込み' }));
    await waitFor(() => expect(description.value).toBe('サーバー最新値'));
    expect(screen.queryByText(/ほかで更新されています/)).toBeNull();
    await user.type(description, 'から変更');
    await user.tab();
    await waitFor(() => expect(voucherWrites()).toHaveLength(2));
    expect(voucherWrites()[1].body.expected_updated_at).toBe('2026-10-10 10:00:00');
  });
});
