import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import VoucherEdit from '../VoucherEdit';

const requests: Array<{ url: string; method: string; body: any }> = [];
let categories: any[] = [];
let lineSaveFails = false;
let failedItemName: string | null = null;
let remainingFailures = 0;

beforeEach(() => {
  requests.length = 0;
  categories = [];
  lineSaveFails = false;
  failedItemName = null;
  remainingFailures = 0;
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    requests.push({ url, method, body });
    if (url.endsWith('/customers')) return new Response(JSON.stringify([{ id: 1, name: '得意先A' }]));
    if (url.endsWith('/projects')) return new Response('[]');
    if (url.endsWith('/aggregation-categories')) return new Response(JSON.stringify(categories));
    if (url.endsWith('/sales-categories')) return new Response('[]');
    if (method === 'POST' && url.endsWith('/vouchers')) return new Response(JSON.stringify({ id: 77 }), { status: 201 });
    if (method === 'POST' && url.endsWith('/vouchers/77/lines')) {
      const shouldFail = lineSaveFails || (body.item_name === failedItemName && remainingFailures-- > 0);
      return shouldFail
        ? new Response(JSON.stringify({ error: '明細保存エラー' }), { status: 500 })
        : new Response(JSON.stringify({ id: 88 }), { status: 201 });
    }
    return new Response('{}');
  }));
});

function renderNew() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/vouchers/new']}>
        <Routes><Route path="/vouchers/new" element={<VoucherEdit />} /><Route path="/vouchers/:id" element={<div>保存後</div>} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('VoucherEdit R-0119', () => {
  it('集計区分が0件なら警告を表示し、明細入力UIを表示しない', async () => {
    renderNew();
    expect((await screen.findByRole('alert')).textContent).toContain('集計区分が未同期のため明細を編集できません。設定画面から同期してください');
    expect(screen.queryByPlaceholderText('品名')).toBeNull();
  });

  it('新規伝票はヘッダー作成後に画面上の明細を保存してから遷移する', async () => {
    categories = [{ id: 1, code: 'MAIN', name: '本体', measure_type: 'money', sort_order: 1 }];
    const user = userEvent.setup();
    renderNew();
    await screen.findByText('得意先A');
    await user.selectOptions(document.querySelector('select[name="customer_id"]') as HTMLSelectElement, '1');
    await user.type(screen.getByPlaceholderText('品名'), '新規明細');
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(await screen.findByText('保存後')).toBeTruthy();
    const posts = requests.filter(r => r.method === 'POST');
    expect(posts.map(r => r.url)).toEqual(expect.arrayContaining([expect.stringMatching(/\/vouchers$/), expect.stringMatching(/\/vouchers\/77\/lines$/)]));
    expect(posts.find(r => r.url.endsWith('/vouchers/77/lines'))?.body.item_name).toBe('新規明細');
    await waitFor(() => expect(posts.findIndex(r => r.url.endsWith('/vouchers'))).toBeLessThan(posts.findIndex(r => r.url.endsWith('/vouchers/77/lines'))));
  });

  it('新規伝票の明細保存に失敗したら遷移せずエラーを表示する', async () => {
    categories = [{ id: 1, code: 'MAIN', name: '本体', measure_type: 'money', sort_order: 1 }];
    lineSaveFails = true;
    const user = userEvent.setup();
    renderNew();
    await screen.findByText('得意先A');
    await user.selectOptions(document.querySelector('select[name="customer_id"]') as HTMLSelectElement, '1');
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(await screen.findByText(/保存に失敗しました/)).toBeTruthy();
    expect(screen.queryByText('保存後')).toBeNull();
  });

  it('明細保存の再試行では伝票と保存済み明細を二重作成せず失敗行から再開する', async () => {
    categories = [{ id: 1, code: 'MAIN', name: '本体', measure_type: 'money', sort_order: 1 }];
    failedItemName = '明細2';
    remainingFailures = 1;
    const user = userEvent.setup();
    renderNew();
    await screen.findByText('得意先A');
    await user.selectOptions(document.querySelector('select[name="customer_id"]') as HTMLSelectElement, '1');
    await user.type(screen.getByPlaceholderText('品名'), '明細1');
    await user.click(screen.getByRole('button', { name: '+ 行を追加' }));
    const itemInputs = screen.getAllByPlaceholderText('品名');
    await user.type(itemInputs[1], '明細2');

    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(await screen.findByText(/保存に失敗しました/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(await screen.findByText('保存後')).toBeTruthy();

    const headerPosts = requests.filter(r => r.method === 'POST' && r.url.endsWith('/vouchers'));
    const linePosts = requests.filter(r => r.method === 'POST' && r.url.endsWith('/vouchers/77/lines'));
    expect(headerPosts).toHaveLength(1);
    expect(linePosts.map(r => r.body.item_name)).toEqual(['明細1', '明細2', '明細2']);
  });
});
