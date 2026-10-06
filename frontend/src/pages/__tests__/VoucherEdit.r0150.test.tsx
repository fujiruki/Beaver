import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import VoucherEdit from '../VoucherEdit';
import { AppSettingsProvider } from '../../contexts/AppSettingsContext';

const requests: Array<{ url: string; method: string; body: any }> = [];

beforeEach(() => {
  localStorage.clear();
  requests.length = 0;
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    requests.push({ url, method, body });
    if (url.endsWith('/customers')) return new Response(JSON.stringify([{ id: 1, name: '得意先A' }]));
    if (url.endsWith('/projects')) return new Response(JSON.stringify([]));
    if (url.endsWith('/aggregation-categories')) return new Response(JSON.stringify([]));
    if (url.endsWith('/sales-categories')) return new Response('[]');
    if (method === 'POST' && url.endsWith('/vouchers')) return new Response(JSON.stringify({ id: 77 }), { status: 201 });
    return new Response('{}');
  }));
});

function renderNew() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AppSettingsProvider>
        <MemoryRouter initialEntries={['/vouchers/new']}>
          <Routes><Route path="/vouchers/new" element={<VoucherEdit />} /><Route path="/vouchers/:id" element={<div>保存後</div>} /></Routes>
        </MemoryRouter>
      </AppSettingsProvider>
    </QueryClientProvider>,
  );
}

describe('VoucherEdit R-0150 consumption_tax_type 初期値修正', () => {
  it('新規伝票作成時、consumption_tax_typeの初期値は外税/伝票計である', async () => {
    const user = userEvent.setup();
    renderNew();
    await screen.findByText('得意先A');
    await user.selectOptions(document.querySelector('select[name="customer_id"]') as HTMLSelectElement, '1');
    await user.click(screen.getByRole('button', { name: '保存' }));
    await screen.findByText('保存後');
    const headerPost = requests.find(r => r.method === 'POST' && r.url.endsWith('/vouchers'));
    expect(headerPost?.body.consumption_tax_type).toBe('外税/伝票計');
  });
});
