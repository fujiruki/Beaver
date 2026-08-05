import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import ProjectList from '../ProjectList';

// R-0085: project_statuses が設定画面から追加され得るため、statusColor/statusLabel の
// 固定7色マップに存在しない新規ステータス（例: 設定画面で追加した値、または旧'cancelled'バグの
// 修正後に導入された'キャンセル'）は既定色（bg-slate-100 text-slate-600）にフォールバックすること。
const ALL_PROJECTS = [
  { id: 1, project_code: 'P-1', name: '田中邸新築', customer_id: 1, customer_name: '田中商店', status: 'キャンセル', start_date: '2026-01-01' },
];

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const u = new URL(url, 'http://localhost');
    if (u.pathname.endsWith('/customers')) {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    return new Response(JSON.stringify({
      data: ALL_PROJECTS,
      meta: { total: ALL_PROJECTS.length, page: 1, per_page: 50, last_page: 1 },
    }), { status: 200 });
  }));
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

describe('ProjectList 未知ステータスの色フォールバック (R-0085)', () => {
  it('固定7色マップに無いステータス名は既定色(bg-slate-100 text-slate-600)で表示される', async () => {
    renderPage();
    const badge = await waitFor(() => screen.getByText('キャンセル'));
    expect(badge.className).toContain('bg-slate-100');
    expect(badge.className).toContain('text-slate-600');
  });
});
