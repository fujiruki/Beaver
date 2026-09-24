import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import ProjectList from '../ProjectList';

// R-0147: 案件一覧のステータスフィルタボタン
const ALL_PROJECTS = [
  { id: 1, project_code: 'P-1', name: '田中邸新築', customer_id: 1, customer_name: '田中商店', status: '進行中', start_date: '2026-01-01', delivery_date: '2026-03-01' },
];

let requestedUrls: string[] = [];

beforeEach(() => {
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

describe('ProjectList ステータスフィルタボタン (R-0147)', () => {
  it('ステータスボタンをクリックするとAPIリクエストのstatusパラメータとURLクエリに反映される', async () => {
    renderPage();
    const buttons = await screen.findByTestId('status-filter-buttons');
    await waitFor(() => expect(requestedUrls.length).toBeGreaterThan(0));

    fireEvent.click(within(buttons).getByText('見積済'));

    await waitFor(() => {
      const last = new URL(requestedUrls[requestedUrls.length - 1], 'http://localhost');
      expect(last.searchParams.get('status')).toBe('見積済');
    });
  });

  it('選択中のステータスボタンを再クリックすると解除され、statusパラメータが消える', async () => {
    renderPage();
    const buttons = await screen.findByTestId('status-filter-buttons');
    await waitFor(() => expect(requestedUrls.length).toBeGreaterThan(0));

    fireEvent.click(within(buttons).getByText('見積済'));
    await waitFor(() => {
      const last = new URL(requestedUrls[requestedUrls.length - 1], 'http://localhost');
      expect(last.searchParams.get('status')).toBe('見積済');
    });

    fireEvent.click(within(buttons).getByText('見積済'));
    await waitFor(() => {
      const last = new URL(requestedUrls[requestedUrls.length - 1], 'http://localhost');
      expect(last.searchParams.get('status')).toBeNull();
    });
  });

  it('「すべて」をクリックすると選択が解除される', async () => {
    renderPage();
    const buttons = await screen.findByTestId('status-filter-buttons');
    await waitFor(() => expect(requestedUrls.length).toBeGreaterThan(0));

    fireEvent.click(within(buttons).getByText('進行中'));
    await waitFor(() => {
      const last = new URL(requestedUrls[requestedUrls.length - 1], 'http://localhost');
      expect(last.searchParams.get('status')).toBe('進行中');
    });

    fireEvent.click(within(buttons).getByText('すべて'));
    await waitFor(() => {
      const last = new URL(requestedUrls[requestedUrls.length - 1], 'http://localhost');
      expect(last.searchParams.get('status')).toBeNull();
    });
  });

  it('URLにstatusが既に入っている状態から表示すると、その状態が復元される（リロード後の復元）', async () => {
    renderPage(['/projects?status=%E5%AE%8C%E4%BA%86']);
    await waitFor(() => expect(requestedUrls.length).toBeGreaterThan(0));

    const last = new URL(requestedUrls[requestedUrls.length - 1], 'http://localhost');
    expect(last.searchParams.get('status')).toBe('完了');

    const buttons = await screen.findByTestId('status-filter-buttons');
    const activeButton = within(buttons).getByText('完了');
    expect(activeButton.className).toContain('bg-blue-600');
  });

  it('キャンセルを含む全8種類＋すべてのボタンが工程順で表示される', async () => {
    renderPage();
    const buttons = await screen.findByTestId('status-filter-buttons');
    const labels = within(buttons).getAllByRole('button').map(b => b.textContent);
    expect(labels).toEqual(['すべて', '問い合わせ', '見積済', '受注済', '進行中', '納品済', '請求済', '完了', 'キャンセル']);
  });
});
