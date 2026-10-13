import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import CustomerList from '../CustomerList';

const customer = {
  id: 7, code: '7', name: '競合得意先', tel: null, address1: null, address2: null,
  updated_at: '2026-10-10 09:00:00',
};

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('confirm', vi.fn(() => true));
});

describe('R-0167 得意先一覧の楽観的ロック', () => {
  it('削除時にupdated_atを送り、409なら案内を出して一覧を再取得する', async () => {
    let getCount = 0;
    let deleteBody: any = null;
    vi.stubGlobal('fetch', vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (method === 'DELETE') {
        deleteBody = JSON.parse(String(init?.body ?? '{}'));
        return new Response(JSON.stringify({ error: 'stale_customer', customer }), { status: 409 });
      }
      getCount += 1;
      return new Response(JSON.stringify({
        data: [customer], meta: { total: 1, page: 1, per_page: 50, last_page: 1 },
      }));
    }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const user = userEvent.setup();
    render(<QueryClientProvider client={client}><MemoryRouter><CustomerList /></MemoryRouter></QueryClientProvider>);
    await screen.findByRole('heading', { name: '得意先一覧' });
    await user.click(screen.getByRole('button', { name: '削除' }));
    await waitFor(() => expect(deleteBody).not.toBeNull());
    expect(deleteBody.expected_updated_at).toBe('2026-10-10 09:00:00');
    expect(await screen.findByText('ほかで更新されています。一覧を読み込み直しました。もう一度確認してから削除してください。')).toBeTruthy();
    await waitFor(() => expect(getCount).toBeGreaterThan(1));
  });
});
