import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import Dashboard from '../Dashboard';

const PROJECT_STATUSES = [
  { id: 1, name: '問い合わせ', sort_order: 1, is_active: 1, created_at: '' },
  { id: 2, name: '見積済',     sort_order: 2, is_active: 1, created_at: '' },
  { id: 3, name: '受注済',     sort_order: 3, is_active: 1, created_at: '' },
  { id: 4, name: '進行中',     sort_order: 4, is_active: 1, created_at: '' },
  { id: 5, name: '納品済',     sort_order: 5, is_active: 1, created_at: '' },
  { id: 6, name: '請求済',     sort_order: 6, is_active: 1, created_at: '' },
  { id: 7, name: '完了',       sort_order: 7, is_active: 1, created_at: '' },
  { id: 8, name: 'キャンセル', sort_order: 8, is_active: 1, created_at: '' },
];

const ALL_PROJECTS = [
  { id: 1, project_code: 'P-1', name: '進行中案件A', customer_id: 1, status: '進行中', effective_estimated_hours: 40 },
  { id: 2, project_code: 'P-2', name: '見積済案件B', customer_id: 1, status: '見積済', effective_estimated_hours: 16 },
  { id: 3, project_code: 'P-3', name: '完了案件C',   customer_id: 1, status: '完了',   effective_estimated_hours: 100 },
];

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const u = new URL(url, 'http://localhost');
    if (u.pathname.endsWith('/customers')) return new Response(JSON.stringify([]), { status: 200 });
    if (u.pathname.endsWith('/invoices')) return new Response(JSON.stringify([]), { status: 200 });
    if (u.pathname.endsWith('/vouchers')) return new Response(JSON.stringify([]), { status: 200 });
    if (u.pathname.endsWith('/project-statuses')) return new Response(JSON.stringify(PROJECT_STATUSES), { status: 200 });
    if (u.pathname.endsWith('/projects')) return new Response(JSON.stringify(ALL_PROJECTS), { status: 200 });
    return new Response(JSON.stringify([]), { status: 200 });
  }));
});

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Dashboard 工数目安カード (R-0097)', () => {
  it('完了・キャンセルより前のステータスの案件について、工数目安合計を日数換算して表示する', async () => {
    renderPage();

    // 進行中(40h)+見積済(16h) = 56h / 8h = 7.0日（完了案件Cの100hは含めない）
    await screen.findByText('7.0日');
    expect(screen.getByText(/稼働予定/)).toBeTruthy();
  });
});
