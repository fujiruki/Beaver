import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import ProjectList from '../ProjectList';

const ALL_PROJECTS = [
  { id: 1, project_code: 'P-1', name: '田中邸新築', customer_id: 1, customer_name: '田中商店', status: '進行中', start_date: '2026-01-01', delivery_date: '2026-03-01', effective_estimated_hours: 40 },
  { id: 2, project_code: 'P-2', name: '鈴木邸改修', customer_id: 2, customer_name: '鈴木製作所', status: '見積済', start_date: '2026-02-01', delivery_date: null, effective_estimated_hours: null },
];

beforeEach(() => {
  localStorage.clear();
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

describe('ProjectList 工数目安列 (R-0097)', () => {
  it('「工数目安」列見出しと、日数換算した値が表示される（未設定は—）', async () => {
    renderPage();
    await screen.findByText('田中邸新築');
    expect(screen.getByText('工数目安')).toBeTruthy();
    // hoursPerDay デフォルト8h → 40h/8=5.0日
    expect(screen.getByText('5.0日')).toBeTruthy();
    const row2 = screen.getByText('鈴木邸改修').closest('tr');
    expect(row2?.textContent).toContain('—');
  });
});
