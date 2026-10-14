import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import CustomerDetail from '../CustomerDetail';

const baseCustomer = {
  id: 3, code: '1', name: 'サーバー初期値', name_kana: null, honorific_type: '御中', gender: null,
  postal_code: null, address1: null, address2: null, tel: null, mobile: null, fax: null, email: null,
  memo: '元のメモ', billing_name: null, billing_date_print: 0, cutoff_day: 31,
  billing_offset_days: 15, payment_due_days: 30, carry_forward_balance: 0, is_active: 1,
  access_customer_no: null, created_at: '2026-10-10 08:00:00', updated_at: '2026-10-10 09:00:00',
};

type RequestRecord = { method: string; body: any };
const requests: RequestRecord[] = [];

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const router = createMemoryRouter([
    { path: '/customers/:id', element: <CustomerDetail /> },
    { path: '/customers', element: <div>得意先一覧</div> },
  ], { initialEntries: ['/customers/3'] });
  render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>);
}

beforeEach(() => {
  requests.length = 0;
});

describe('R-0167 得意先詳細の楽観的ロック', () => {
  it('保存時に読み込み時のupdated_atを送る', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      requests.push({ method, body });
      return new Response(JSON.stringify(method === 'PUT' ? { ...baseCustomer, ...body } : baseCustomer));
    }));
    const user = userEvent.setup();
    renderPage();
    const memo = await screen.findByDisplayValue('元のメモ');
    await user.clear(memo);
    await user.type(memo, '編集後');
    await user.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(requests.some(r => r.method === 'PUT')).toBe(true));
    expect(requests.find(r => r.method === 'PUT')?.body.expected_updated_at).toBe('2026-10-10 09:00:00');
  });

  it('409では競合表示を出し、画面を離れず入力値を残す', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (method === 'PUT') return new Response(JSON.stringify({
        error: 'stale_customer',
        customer: { ...baseCustomer, name: 'サーバー最新値', updated_at: '2026-10-10 10:00:00' },
      }), { status: 409 });
      return new Response(JSON.stringify(baseCustomer));
    }));
    const user = userEvent.setup();
    renderPage();
    const name = await screen.findByDisplayValue('サーバー初期値');
    await user.clear(name);
    await user.type(name, '入力中の値');
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(await screen.findByText(/ほかで更新されています（最終更新: 2026-10-10 10:00:00）/)).toBeTruthy();
    expect(screen.getByRole('button', { name: '再読み込み' })).toBeTruthy();
    expect(screen.getByDisplayValue('入力中の値')).toBeTruthy();
    expect(screen.queryByText('得意先一覧')).toBeNull();
    expect(screen.queryByText(/保存に失敗しました/)).toBeNull();
  });

  it('再読み込みで最新値を反映し、次の保存は新しいupdated_atを送る', async () => {
    let getCount = 0;
    let putCount = 0;
    vi.stubGlobal('fetch', vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      requests.push({ method, body });
      if (method === 'PUT') {
        putCount += 1;
        if (putCount === 1) return new Response(JSON.stringify({
          error: 'stale_customer',
          customer: { ...baseCustomer, name: 'サーバー最新値', updated_at: '2026-10-10 10:00:00' },
        }), { status: 409 });
        return new Response(JSON.stringify({ ...baseCustomer, ...body, updated_at: '2026-10-10 10:00:01' }));
      }
      getCount += 1;
      return new Response(JSON.stringify(getCount === 1 ? baseCustomer : {
        ...baseCustomer, name: 'サーバー最新値', updated_at: '2026-10-10 10:00:00',
      }));
    }));
    const user = userEvent.setup();
    renderPage();
    const name = await screen.findByDisplayValue('サーバー初期値');
    await user.clear(name);
    await user.type(name, '競合する入力');
    await user.click(screen.getByRole('button', { name: '保存' }));
    await screen.findByText(/ほかで更新されています/);
    await user.click(screen.getByRole('button', { name: '再読み込み' }));
    await waitFor(() => expect(screen.getByDisplayValue('サーバー最新値')).toBeTruthy());
    expect(screen.queryByText(/ほかで更新されています/)).toBeNull();
    expect(screen.queryByText(/保存に失敗しました/)).toBeNull();
    const latestName = screen.getByDisplayValue('サーバー最新値');
    await user.clear(latestName);
    await user.type(latestName, '再編集');
    await user.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(requests.filter(r => r.method === 'PUT')).toHaveLength(2));
    expect(requests.filter(r => r.method === 'PUT')[1].body.expected_updated_at).toBe('2026-10-10 10:00:00');
  });
});
