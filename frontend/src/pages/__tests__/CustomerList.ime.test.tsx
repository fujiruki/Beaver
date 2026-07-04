import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import CustomerList from '../CustomerList';

const ALL_CUSTOMERS = [
  { id: 1, code: '1', name: '田中商店', tel: null, address1: null, address2: null },
  { id: 2, code: '2', name: '鈴木製作所', tel: null, address1: null, address2: null },
];

let requestedQueries: string[] = [];

beforeEach(() => {
  requestedQueries = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const u = new URL(url, 'http://localhost');
    const q = u.searchParams.get('q') ?? '';
    requestedQueries.push(q);
    const data = q ? ALL_CUSTOMERS.filter(c => c.name.includes(q)) : ALL_CUSTOMERS;
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
        <CustomerList />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('CustomerList IMEインクリメンタルサーチ (R-068)', () => {
  it('IME変換中はonChangeで検索APIを発火せず、フォーカスも維持される', async () => {
    renderPage();
    const input = await screen.findByPlaceholderText('得意先名・コードで検索') as HTMLInputElement;
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
    const input = await screen.findByPlaceholderText('得意先名・コードで検索') as HTMLInputElement;
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
