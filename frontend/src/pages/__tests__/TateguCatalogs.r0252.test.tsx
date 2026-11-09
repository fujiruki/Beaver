import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import TateguCatalogs from '../TateguCatalogs';

const CATALOGS = [{ id: 7, name: '障子カタログ', sort_order: 1, item_count: 3 }];
const ITEMS = [
  { id: 1, code: '00001', name: '台帳A' },
  { id: 2, code: '00002', name: '台帳B' },
  { id: 3, code: '00003', name: '台帳C' },
];

let calls: { url: string; method: string; body?: string }[] = [];

beforeEach(() => {
  calls = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method ?? 'GET', body: init?.body as string | undefined });
    if (url.endsWith('/ledger-catalogs') && !init?.method) return new Response(JSON.stringify(CATALOGS), { status: 200 });
    if (url.endsWith('/ledger-catalogs/7/items') && !init?.method) return new Response(JSON.stringify(ITEMS), { status: 200 });
    return new Response(JSON.stringify({ id: 9, name: '新しいカタログ', ok: true }), { status: 200 });
  }));
});

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><TateguCatalogs /></MemoryRouter>
    </QueryClientProvider>,
  );
}

function lastPutBody() {
  const puts = calls.filter(c => c.method === 'PUT' && c.url.endsWith('/ledger-catalogs/7/items'));
  return JSON.parse(puts[puts.length - 1].body!);
}

describe('TateguCatalogs カタログの編集画面 (R-0252)', () => {
  it('カタログを選ぶと中の台帳が順番どおりに出る', async () => {
    renderPage();
    fireEvent.click(await screen.findByText('障子カタログ'));
    await screen.findByText('台帳A');
    expect(screen.getAllByTestId('catalog-item-name').map(e => e.textContent)).toEqual(['台帳A', '台帳B', '台帳C']);
  });

  it('「下へ」で1つ下げると、並べ替えた順で PUT する', async () => {
    renderPage();
    fireEvent.click(await screen.findByText('障子カタログ'));
    await screen.findByText('台帳A');
    fireEvent.click(screen.getAllByRole('button', { name: '下へ' })[0]);
    await waitFor(() => expect(lastPutBody()).toEqual({ tategu_item_ids: [2, 1, 3] }));
  });

  it('「外す」で中の台帳からその1件を除いて PUT する', async () => {
    renderPage();
    fireEvent.click(await screen.findByText('障子カタログ'));
    await screen.findByText('台帳B');
    fireEvent.click(screen.getAllByRole('button', { name: '外す' })[1]);
    await waitFor(() => expect(lastPutBody()).toEqual({ tategu_item_ids: [1, 3] }));
  });

  it('名前を入れて「追加」でカタログを作る', async () => {
    renderPage();
    await screen.findByText('障子カタログ');
    fireEvent.change(screen.getByLabelText('新しいカタログの名前'), { target: { value: '框カタログ' } });
    fireEvent.click(screen.getByRole('button', { name: '追加' }));
    await waitFor(() => {
      const post = calls.find(c => c.method === 'POST' && c.url.endsWith('/ledger-catalogs'));
      expect(JSON.parse(post!.body!)).toEqual({ name: '框カタログ' });
    });
  });

  it('「カタログを削除」は確認のあと DELETE する', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true));
    renderPage();
    fireEvent.click(await screen.findByText('障子カタログ'));
    fireEvent.click(await screen.findByRole('button', { name: 'カタログを削除' }));
    await waitFor(() => {
      expect(calls.some(c => c.method === 'DELETE' && c.url.endsWith('/ledger-catalogs/7'))).toBe(true);
    });
  });
});
