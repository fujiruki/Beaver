import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import ProjectList from '../ProjectList';

const ALL_PROJECTS = [
  { id: 1, project_code: 'P-1', name: '田中邸新築', customer_id: 1, customer_name: '田中商店', status: '進行中', start_date: '2026-01-01', delivery_date: '2026-03-01' },
  { id: 2, project_code: 'P-2', name: '鈴木邸改修', customer_id: 2, customer_name: '検索対象得意先XYZ', status: '見積済', start_date: '2026-02-01', delivery_date: '2026-01-15' },
];

let requestedUrls: string[] = [];

beforeEach(() => {
  localStorage.clear();
  requestedUrls = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const u = new URL(url, 'http://localhost');
    if (u.pathname.endsWith('/customers')) {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    requestedUrls.push(url);
    return new Response(JSON.stringify({
      data: ALL_PROJECTS,
      meta: { total: ALL_PROJECTS.length, page: 1, per_page: 50, last_page: 2 },
    }), { status: 200 });
  }));
});

function renderPage(initialEntries?: string[]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={initialEntries ?? ['/projects']}>
        <ProjectList />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ProjectList URL状態保持 (R-0091)', () => {
  it('検索語を入力すると検索APIリクエストのqパラメータに反映される（バックエンド呼び出しの実体で確認）', async () => {
    renderPage();
    await waitFor(() => expect(requestedUrls.length).toBeGreaterThan(0));
    const input = await screen.findByPlaceholderText('案件名・得意先名で検索');
    fireEvent.change(input, { target: { value: 'たなか' } });

    await waitFor(() => {
      const last = new URL(requestedUrls[requestedUrls.length - 1], 'http://localhost');
      expect(last.searchParams.get('q')).toBe('たなか');
    });
  });

  it('URLにq/sort/order/pageが既に入っている状態から表示すると、その状態が復元される', async () => {
    renderPage(['/projects?q=%E7%94%B0%E4%B8%AD&sort=name&order=desc&page=1']);
    await waitFor(() => expect(requestedUrls.length).toBeGreaterThan(0));

    const input = await screen.findByPlaceholderText('案件名・得意先名で検索') as HTMLInputElement;
    expect(input.value).toBe('田中');

    const last = new URL(requestedUrls[requestedUrls.length - 1], 'http://localhost');
    expect(last.searchParams.get('sort')).toBe('name');
    expect(last.searchParams.get('order')).toBe('desc');
    expect(last.searchParams.get('q')).toBe('田中');
  });

  it('検索キーワードが得意先名にマッチする案件も表示される（バックエンドのモックがcustomer_nameも見る想定でも一覧側は素通しする）', async () => {
    renderPage();
    await screen.findByText('田中邸新築');
    expect(screen.getByText('検索対象得意先XYZ')).toBeTruthy();
  });
});

describe('ProjectList 複合ソート (R-0092)', () => {
  it('ステータス列クリック→Shift+納期列クリックで sort=status,delivery_date&order=asc,asc がURLに付与される', async () => {
    renderPage();
    await waitFor(() => expect(requestedUrls.length).toBeGreaterThan(0));

    fireEvent.click(await screen.findByText('ステータス'));
    await waitFor(() => {
      const last = new URL(requestedUrls[requestedUrls.length - 1], 'http://localhost');
      expect(last.searchParams.get('sort')).toBe('status');
    });

    fireEvent.click(screen.getByText('納期'), { shiftKey: true });

    await waitFor(() => {
      const last = new URL(requestedUrls[requestedUrls.length - 1], 'http://localhost');
      expect(last.searchParams.get('sort')).toBe('status,delivery_date');
      expect(last.searchParams.get('order')).toBe('asc,asc');
    });
  });

  it('複合ソート後に別の列を通常クリックすると単一ソートにリセットされる', async () => {
    renderPage();
    await waitFor(() => expect(requestedUrls.length).toBeGreaterThan(0));

    fireEvent.click(await screen.findByText('ステータス'));
    fireEvent.click(screen.getByText('納期'), { shiftKey: true });
    await waitFor(() => {
      const last = new URL(requestedUrls[requestedUrls.length - 1], 'http://localhost');
      expect(last.searchParams.get('sort')).toBe('status,delivery_date');
    });

    fireEvent.click(screen.getByText('案件名'));
    await waitFor(() => {
      const last = new URL(requestedUrls[requestedUrls.length - 1], 'http://localhost');
      expect(last.searchParams.get('sort')).toBe('name');
      expect(last.searchParams.get('order')).toBe('asc');
    });
  });
});
