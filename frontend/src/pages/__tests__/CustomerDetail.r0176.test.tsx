import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CustomerDetail from '../CustomerDetail';
import NewCustomerModal from '../../components/NewCustomerModal';

const candidate = {
  id: 12, code: '0012', name: '株式会社 山田工務店', name_kana: 'ヤマダコウムテン',
  tel: '06-1234-5678', mobile: null, address1: '大阪府大阪市', is_active: 0,
  access_customer_no: '12', matched: ['name'],
};

function wrapper(children: React.ReactNode, initialEntry = '/customers/new') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialEntry]}>{children}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('R-0176 似た得意先候補', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('新規登録で候補を表示し、選ぶと既存得意先の詳細へ移る', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/customers/similar')) return new Response(JSON.stringify([candidate]), { status: 200 });
      return new Response('{}', { status: 200 });
    }));
    const user = userEvent.setup();
    const { container } = wrapper(
      <Routes>
        <Route path="/customers/new" element={<CustomerDetail />} />
        <Route path="/customers/12" element={<div>既存得意先詳細</div>} />
      </Routes>,
    );
    await user.type(container.querySelector('[name="name"]')!, '山田工務店');
    expect(await screen.findByText('似た得意先があります。同じ得意先ならそちらを使ってください')).not.toBeNull();
    expect(screen.getByText('無効')).not.toBeNull();
    await user.click(screen.getByRole('button', { name: /0012.*株式会社 山田工務店/ }));
    expect(await screen.findByText('既存得意先詳細')).not.toBeNull();
  });

  it('候補を無視して保存するとPOSTされる', async () => {
    const requests: Array<{ url: string; method: string }> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      requests.push({ url, method });
      if (url.includes('/customers/similar')) return new Response(JSON.stringify([candidate]), { status: 200 });
      return new Response(JSON.stringify({ ...candidate, id: 13 }), { status: 201 });
    }));
    const user = userEvent.setup();
    const { container } = wrapper(
      <Routes>
        <Route path="/customers/new" element={<CustomerDetail />} />
        <Route path="/customers" element={<div>一覧</div>} />
      </Routes>,
    );
    await user.type(container.querySelector('[name="name"]')!, '山田工務店');
    await screen.findByText('似た得意先があります。同じ得意先ならそちらを使ってください');
    await user.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(requests.some((r) => r.url.endsWith('/customers') && r.method === 'POST')).toBe(true));
  });

  it('既存得意先の編集では候補APIを呼ばない', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      urls.push(url);
      return new Response(JSON.stringify({
        ...candidate, honorific_type: '御中', gender: null, postal_code: null, address2: null,
        fax: null, email: null, memo: null, billing_name: null, billing_date_print: 0,
        cutoff_day: 31, billing_offset_days: 15, payment_due_days: 30,
        carry_forward_balance: 0, created_at: '', updated_at: '',
      }), { status: 200 });
    }));
    const user = userEvent.setup();
    const { container } = wrapper(<Routes><Route path="/customers/:id" element={<CustomerDetail />} /></Routes>, '/customers/12');
    const input = await waitFor(() => {
      const element = container.querySelector('[name="name"]') as HTMLInputElement | null;
      expect(element).not.toBeNull();
      return element!;
    });
    await user.type(input, '追加');
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(urls.some((url) => url.includes('/customers/similar'))).toBe(false);
  });

  it('新規得意先モーダルで候補を選ぶと既存得意先をonCreatedへ渡す', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/customers/similar')) return new Response(JSON.stringify([candidate]), { status: 200 });
      return new Response('{}', { status: 200 });
    }));
    const onCreated = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();
    const { container } = wrapper(<NewCustomerModal isOpen onClose={onClose} onCreated={onCreated} />);
    await user.type(container.querySelector('[name="name"]')!, '山田工務店');
    await user.click(await screen.findByRole('button', { name: /0012.*株式会社 山田工務店/ }));
    expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ id: 12, name: '株式会社 山田工務店' }));
    expect(onClose).toHaveBeenCalled();
  });
});
