import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import ProjectList from '../ProjectList';

const ALL_PROJECTS = [
  { id: 1, project_code: 'P-1', name: '田中邸新築', customer_id: 1, customer_name: '田中商店', status: '進行中', start_date: '2026-01-01' },
  { id: 2, project_code: 'P-2', name: '鈴木邸改修', customer_id: 2, customer_name: '鈴木製作所', status: '見積済', start_date: '2026-02-01' },
];

let requestedQueries: string[] = [];

beforeEach(() => {
  requestedQueries = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const u = new URL(url, 'http://localhost');
    if (u.pathname.endsWith('/customers')) {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    const q = u.searchParams.get('q') ?? '';
    requestedQueries.push(q);
    const data = q ? ALL_PROJECTS.filter(p => p.name.includes(q)) : ALL_PROJECTS;
    return new Response(JSON.stringify({
      data,
      meta: { total: data.length, page: 1, per_page: 50, last_page: 1 },
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

describe('ProjectList IMEインクリメンタルサーチ (R-070)', () => {
  it('IME変換中はonChangeで検索APIを発火せず、フォーカスも維持される', async () => {
    renderPage();
    const input = await screen.findByPlaceholderText('案件名で検索') as HTMLInputElement;
    input.focus();
    expect(document.activeElement).toBe(input);

    await waitFor(() => expect(requestedQueries.length).toBeGreaterThan(0));
    const callsBeforeTyping = requestedQueries.length;

    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: 'た' } });

    expect(requestedQueries.length).toBe(callsBeforeTyping);
    expect(document.activeElement).toBe(input);

    fireEvent.compositionEnd(input, { data: 'た' });

    await waitFor(() => expect(requestedQueries.length).toBeGreaterThan(callsBeforeTyping));
    expect(requestedQueries[requestedQueries.length - 1]).toBe('た');
    expect(document.activeElement).toBe(input);
  });

  it('複数文字を連続確定してもフォーカスが外れない', async () => {
    renderPage();
    const input = await screen.findByPlaceholderText('案件名で検索') as HTMLInputElement;
    input.focus();
    await waitFor(() => expect(requestedQueries.length).toBeGreaterThan(0));

    const sequence: [string, string][] = [['た', 'た'], ['たな', 'たな']];
    for (const [partial, committed] of sequence) {
      fireEvent.compositionStart(input);
      fireEvent.change(input, { target: { value: partial } });
      fireEvent.compositionEnd(input, { data: committed });
      await waitFor(() => expect(document.activeElement).toBe(input));
    }

    expect(requestedQueries[requestedQueries.length - 1]).toBe('たな');
  });
});
