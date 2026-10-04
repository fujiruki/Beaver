import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import VoucherEdit from '../VoucherEdit';
import { AppSettingsProvider } from '../../contexts/AppSettingsContext';

const requests: Array<{ url: string; method: string; body: any }> = [];
const projects = [
  { id: 42, name: '案件A', customer_id: 1 },
  { id: 50, name: '案件B', customer_id: 2 },
  { id: 60, name: '案件C', customer_id: null },
];
const customers = [{ id: 1, name: '得意先A' }, { id: 2, name: '得意先B' }];

function makeVoucher(overrides: Record<string, any> = {}) {
  return {
    id: 6, voucher_no: 'V-0006', voucher_type: 'estimate', status: 'draft',
    project_id: null, customer_id: 1, voucher_date: '2026-09-01', delivery_date: null,
    tax_input_type: 'exclusive', consumption_tax_type: '課税', override_billing_date: null,
    profit_rate: 0.3, description: null, memo: null, validity_period: null,
    subtotal_taxable: 0, tax_amount: 0, total_amount: 0, lines: [],
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
  requests.length = 0;
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    requests.push({ url, method, body });
    if (url.endsWith('/customers')) return new Response(JSON.stringify(customers));
    if (url.endsWith('/projects')) return new Response(JSON.stringify(projects));
    if (url.endsWith('/aggregation-categories')) return new Response(JSON.stringify([]));
    if (url.endsWith('/sales-categories')) return new Response('[]');
    if (url.endsWith('/vouchers/6')) return new Response(JSON.stringify(makeVoucher()));
    return new Response('{}');
  }));
});

function renderNew(entry = '/vouchers/new') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AppSettingsProvider>
        <MemoryRouter initialEntries={[entry]}>
          <Routes><Route path="/vouchers/new" element={<VoucherEdit />} /></Routes>
        </MemoryRouter>
      </AppSettingsProvider>
    </QueryClientProvider>,
  );
}

function renderExisting() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AppSettingsProvider>
        <MemoryRouter initialEntries={['/vouchers/6']}>
          <Routes><Route path="/vouchers/:id" element={<VoucherEdit />} /></Routes>
        </MemoryRouter>
      </AppSettingsProvider>
    </QueryClientProvider>,
  );
}

function customerSelect() {
  return document.querySelector('select[name="customer_id"]') as HTMLSelectElement;
}
function projectSelect() {
  return document.querySelector('select[name="project_id"]') as HTMLSelectElement;
}

describe('VoucherEdit R-0148 案件選択時の得意先デフォルト設定', () => {
  it('新規伝票作成中、得意先未選択で案件を選ぶと得意先が自動設定される', async () => {
    const user = userEvent.setup();
    renderNew();
    await screen.findByText('案件A');
    expect(customerSelect().value).toBe('0');

    await user.selectOptions(projectSelect(), '42');

    await waitFor(() => expect(customerSelect().value).toBe('1'));
  });

  it('得意先を先に手動選択してから案件を選んでも、得意先は上書きされない', async () => {
    const user = userEvent.setup();
    renderNew();
    await screen.findByText('案件A');

    await user.selectOptions(customerSelect(), '2');
    await user.selectOptions(projectSelect(), '42');

    await waitFor(() => expect(projectSelect().value).toBe('42'));
    expect(customerSelect().value).toBe('2');
  });

  it('既存伝票の編集画面で案件を変更しても、得意先は自動変更されない', async () => {
    const user = userEvent.setup();
    renderExisting();
    await screen.findByText('案件A');
    await waitFor(() => expect(customerSelect().value).toBe('1'));

    await user.selectOptions(projectSelect(), '50');

    await waitFor(() => expect(projectSelect().value).toBe('50'));
    expect(customerSelect().value).toBe('1');
  });

  it('選択した案件に得意先が設定されていない場合、得意先セレクトは変化しない', async () => {
    const user = userEvent.setup();
    renderNew();
    await screen.findByText('案件A');
    expect(customerSelect().value).toBe('0');

    await user.selectOptions(projectSelect(), '60');

    await waitFor(() => expect(projectSelect().value).toBe('60'));
    expect(customerSelect().value).toBe('0');
  });
});
