import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import ProjectList from '../ProjectList';

const ALL_PROJECTS = [
  { id: 1, project_code: 'P-1', name: '田中邸新築', customer_id: 1, customer_name: '田中商店', status: '進行中', start_date: '2026-01-01' },
  { id: 2, project_code: 'P-2', name: '鈴木邸改修', customer_id: 2, customer_name: '鈴木製作所', status: '見積済', start_date: '2026-02-01' },
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
      meta: { total: ALL_PROJECTS.length, page: 1, per_page: 50, last_page: 1 },
    }), { status: 200 });
  }));
});

it('restores multi-sort from localStorage after remounting ProjectList', async () => {
  const first = renderPage();
  await waitFor(() => expect(requestedUrls.length).toBeGreaterThan(0));

  fireEvent.click(await screen.findByText('ステータス'));
  fireEvent.click(screen.getByText('納期'), { shiftKey: true });
  await waitFor(() => {
    expect(JSON.parse(localStorage.getItem('bv_table_sort_projects') ?? 'null')).toEqual([
      { key: 'status', dir: 'asc' },
      { key: 'delivery_date', dir: 'asc' },
    ]);
  });

  first.unmount();
  requestedUrls = [];
  renderPage();
  await waitFor(() => {
    const last = new URL(requestedUrls[requestedUrls.length - 1], 'http://localhost');
    expect(last.searchParams.get('sort')).toBe('status,delivery_date');
    expect(last.searchParams.get('order')).toBe('asc,asc');
  });
});

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ProjectList />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ProjectList サーバソート (R-076 Part A)', () => {
  it('R-0116: 新規ブラウザでの初回表示時はステータス（工程順）→納期の複合ソートが既定になる', async () => {
    renderPage();
    await waitFor(() => expect(requestedUrls.length).toBeGreaterThan(0));
    const first = new URL(requestedUrls[0], 'http://localhost');
    expect(first.searchParams.get('sort')).toBe('status,delivery_date');
    expect(first.searchParams.get('order')).toBe('asc,asc');
  });

  it('R-0116: URLにsortパラメータが既にある場合は既定値より優先される', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/projects?sort=name&order=asc']}>
          <ProjectList />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(requestedUrls.length).toBeGreaterThan(0));
    const first = new URL(requestedUrls[0], 'http://localhost');
    expect(first.searchParams.get('sort')).toBe('name');
    expect(first.searchParams.get('order')).toBe('asc');
  });

  it('列見出し「案件名」をクリックすると sort=name&order=asc がURLに付与される', async () => {
    renderPage();
    await waitFor(() => expect(requestedUrls.length).toBeGreaterThan(0));

    fireEvent.click(await screen.findByText('案件名'));

    await waitFor(() => {
      const last = new URL(requestedUrls[requestedUrls.length - 1], 'http://localhost');
      expect(last.searchParams.get('sort')).toBe('name');
      expect(last.searchParams.get('order')).toBe('asc');
      expect(last.searchParams.get('page')).toBe('1');
    });
  });
});
