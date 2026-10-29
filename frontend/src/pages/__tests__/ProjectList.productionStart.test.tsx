import { it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import ProjectList from '../ProjectList';

const PROJECTS = [
  { id: 1, project_code: 'P-1', name: '田中邸新築', customer_id: 1, customer_name: '田中商店', status: '進行中', start_date: '2026-01-01' },
];

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const u = new URL(url, 'http://localhost');
    if (u.pathname.endsWith('/customers')) return new Response(JSON.stringify([]), { status: 200 });
    return new Response(JSON.stringify({
      data: PROJECTS,
      meta: { total: 1, page: 1, per_page: 50, last_page: 1 },
    }), { status: 200 });
  }));
});

it('R-0222: 一覧の「開始日」列は「製作開始」に名前が変わり、写しの日付を出す', async () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><ProjectList /></MemoryRouter>
    </QueryClientProvider>,
  );
  expect(await screen.findByText('製作開始')).toBeTruthy();
  expect(screen.queryByText('開始日')).toBeNull();
  expect(await screen.findByText('2026-01-01')).toBeTruthy();
});
