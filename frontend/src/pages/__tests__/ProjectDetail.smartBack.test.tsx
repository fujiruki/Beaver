import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import ProjectDetail from '../ProjectDetail';

const baseProject = {
  id: 5,
  project_code: 'P-5',
  name: '既存案件',
  customer_id: 1,
  description: null,
  address: null,
  status: '進行中',
  start_date: '2026-01-01',
  end_date: null,
  delivery_date: null,
  memo: null,
  order_date: null,
  owner_name: null,
  general_contractor_name: null,
  site_contact: null,
  created_at: '2026-01-01 00:00:00',
  updated_at: '2026-01-01 00:00:00',
};

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const u = new URL(url, 'http://localhost');
    if (u.pathname.endsWith('/customers')) {
      return new Response(JSON.stringify([{ id: 1, name: '既存得意先', name_kana: null, memo: null }]), { status: 200 });
    }
    if (u.pathname.endsWith('/project-statuses')) {
      return new Response(JSON.stringify([{ id: 1, name: '進行中', sort_order: 4, is_active: 1, created_at: '2026-01-01 00:00:00' }]), { status: 200 });
    }
    return new Response(JSON.stringify(baseProject), { status: 200 });
  }));
});

function ProjectListStub() {
  const location = useLocation();
  return <div>一覧画面: {location.search}</div>;
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter
        initialEntries={['/projects?sort=name&order=desc', '/projects/5']}
        initialIndex={1}
      >
        <Routes>
          <Route path="/projects/:id" element={<ProjectDetail />} />
          <Route path="/projects" element={<ProjectListStub />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ProjectDetail 戻る (R-0096 Phase2)', () => {
  it('一覧のソート状態を保持したまま「← 戻る」で一覧に戻る', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: '← 戻る' }));

    expect(await screen.findByText('一覧画面: ?sort=name&order=desc')).toBeTruthy();
  });

  it('一覧のソート状態を保持したまま「キャンセル」で一覧に戻る', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'キャンセル' }));

    expect(await screen.findByText('一覧画面: ?sort=name&order=desc')).toBeTruthy();
  });
});
