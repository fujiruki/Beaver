import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import ProjectList from '../ProjectList';

const ALL_PROJECTS = [
  { id: 1, project_code: 'P-1', name: '田中邸新築', customer_id: 1, customer_name: '田中商店', status: '進行中', start_date: '2026-01-01', delivery_date: '2026-03-01' },
  { id: 2, project_code: 'P-2', name: '鈴木邸改修', customer_id: 2, customer_name: '鈴木製作所', status: '見積済', start_date: '2026-02-01', delivery_date: null },
];

let requestedUrls: string[] = [];

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-01-15'));
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

afterEach(() => {
  vi.useRealTimers();
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

describe('ProjectList 納期列 (R-0086)', () => {
  it('「納期」列見出しと各行の納期値が表示される（未設定は—）', async () => {
    renderPage();
    const table = await screen.findByTestId('project-desktop-table');
    await within(table).findByText('田中邸新築');
    expect(within(table).getByText('納期')).toBeTruthy();
    expect(within(table).getByText('2026-03-01')).toBeTruthy();
    const row2 = within(table).getByText('鈴木邸改修').closest('tr');
    expect(row2?.textContent).toContain('—');
  });

  it('列見出し「納期」をクリックすると sort=delivery_date&order=asc がURLに付与される', async () => {
    renderPage();
    await waitFor(() => expect(requestedUrls.length).toBeGreaterThan(0));

    fireEvent.click(await screen.findByText('納期'));

    await waitFor(() => {
      const last = new URL(requestedUrls[requestedUrls.length - 1], 'http://localhost');
      expect(last.searchParams.get('sort')).toBe('delivery_date');
      expect(last.searchParams.get('order')).toBe('asc');
    });
  });
});
