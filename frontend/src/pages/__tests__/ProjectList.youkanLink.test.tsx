import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import ProjectList from '../ProjectList';

const PROJECTS = [
  { id: 1, project_code: 'P-1', name: '田中邸新築', customer_id: 1, customer_name: '田中商店', status: '進行中', start_date: '2026-01-01', delivery_date: '2026-03-01' },
];

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

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('R-0130: ProjectList Youkanで見るボタン', () => {
  it('PC版一覧の行内にボタンがあり、クリックしても行の詳細遷移が発火せずYoukanが開く', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const u = new URL(url, 'http://localhost');
      if (u.pathname.endsWith('/customers')) return new Response(JSON.stringify([]), { status: 200 });
      if (u.pathname.endsWith('/youkan-link')) {
        return new Response(JSON.stringify({ ok: true, url: 'https://door-fujita.com/contents/Youkan/Focus?projectId=abc' }), { status: 200 });
      }
      return new Response(JSON.stringify({
        data: PROJECTS,
        meta: { total: PROJECTS.length, page: 1, per_page: 50, last_page: 1 },
      }), { status: 200 });
    }));
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    renderPage();
    const desktopTable = await screen.findByTestId('project-desktop-table');
    const btn = within(desktopTable).getByRole('button', { name: /^Youkan↗$/ });

    fireEvent.click(btn);

    await waitFor(() => expect(openSpy).toHaveBeenCalledWith(
      'https://door-fujita.com/contents/Youkan/Focus?projectId=abc',
      '_blank',
      'noopener,noreferrer',
    ));
    expect(screen.queryByText('詳細画面: /projects/1')).toBeNull();
  });
});
