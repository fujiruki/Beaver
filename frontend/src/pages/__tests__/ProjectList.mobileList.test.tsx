import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import ProjectList from '../ProjectList';

const ALL_PROJECTS = [
  { id: 1, project_code: 'P-1', name: '田中邸新築', customer_id: 1, customer_name: '田中商店', status: '進行中', start_date: '2026-01-01', delivery_date: '2026-03-01' },
  { id: 2, project_code: 'P-2', name: '鈴木邸改修', customer_id: 2, customer_name: '鈴木製作所', status: '見積済', start_date: '2026-02-01', delivery_date: null },
];

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-01-15'));
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

afterEach(() => {
  vi.useRealTimers();
});

function ProjectDetailStub() {
  const location = useLocation();
  return <div>詳細画面: {location.pathname}</div>;
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/projects']}>
        <Routes>
          <Route path="/projects" element={<ProjectList />} />
          <Route path="/projects/:id" element={<ProjectDetailStub />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('R-0129: ProjectList スマホ簡素リスト', () => {
  it('簡素リストがmd:hiddenクラス、DataTableラッパーがhidden md:blockクラスを持つ', async () => {
    renderPage();
    const mobileList = await screen.findByTestId('project-mobile-list');
    const desktopTable = screen.getByTestId('project-desktop-table');
    expect(mobileList.className).toContain('md:hidden');
    expect(desktopTable.className).toContain('hidden');
    expect(desktopTable.className).toContain('md:block');
  });

  it('簡素リスト行をクリックすると案件詳細へ遷移する', async () => {
    renderPage();
    const mobileList = await screen.findByTestId('project-mobile-list');
    const row = await within(mobileList).findByText('田中邸新築');

    fireEvent.click(row);

    await waitFor(() => expect(screen.getByText('詳細画面: /projects/1')).toBeTruthy());
  });

  it('簡素リスト行に得意先名・ステータス・納期が表示される', async () => {
    renderPage();
    const mobileList = await screen.findByTestId('project-mobile-list');
    await within(mobileList).findByText('田中邸新築');

    expect(within(mobileList).getByText('田中商店')).toBeTruthy();
    expect(within(mobileList).getByText('進行中')).toBeTruthy();
    expect(within(mobileList).getByText('2026-03-01')).toBeTruthy();
  });
});
