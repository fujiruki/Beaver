import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import TateguItemList from '../TateguItemList';

const ALL_ITEMS = [
  { id: 1, item_code: 'T-1', name: '片開きドア', spec: null, cost_body: 1000, cost_hardware: 200, cost_glass: 0, cost_factory_hours: 1, cost_site_hours: 1, cost_labor_rate: 100, unit: '枚' },
  { id: 2, item_code: 'T-2', name: '引き戸', spec: null, cost_body: 2000, cost_hardware: 300, cost_glass: 0, cost_factory_hours: 2, cost_site_hours: 1, cost_labor_rate: 100, unit: '枚' },
];

let requestedQueries: string[] = [];

beforeEach(() => {
  requestedQueries = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const u = new URL(url, 'http://localhost');
    const q = u.searchParams.get('q') ?? '';
    requestedQueries.push(q);
    const data = q ? ALL_ITEMS.filter(i => i.name.includes(q)) : ALL_ITEMS;
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
        <TateguItemList />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('TateguItemList IMEインクリメンタルサーチ (R-070)', () => {
  it('IME変換中はonChangeで検索APIを発火せず、フォーカスも維持される', async () => {
    renderPage();
    const input = await screen.findByPlaceholderText('品名・コードで検索') as HTMLInputElement;
    input.focus();
    expect(document.activeElement).toBe(input);

    await waitFor(() => expect(requestedQueries.length).toBeGreaterThan(0));
    const callsBeforeTyping = requestedQueries.length;

    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: 'ひ' } });

    expect(requestedQueries.length).toBe(callsBeforeTyping);
    expect(document.activeElement).toBe(input);

    fireEvent.compositionEnd(input, { data: 'ひ' });

    await waitFor(() => expect(requestedQueries.length).toBeGreaterThan(callsBeforeTyping));
    expect(requestedQueries[requestedQueries.length - 1]).toBe('ひ');
    expect(document.activeElement).toBe(input);
  });

  it('複数文字を連続確定してもフォーカスが外れない', async () => {
    renderPage();
    const input = await screen.findByPlaceholderText('品名・コードで検索') as HTMLInputElement;
    input.focus();
    await waitFor(() => expect(requestedQueries.length).toBeGreaterThan(0));

    const sequence: [string, string][] = [['ひ', 'ひ'], ['ひき', 'ひき']];
    for (const [partial, committed] of sequence) {
      fireEvent.compositionStart(input);
      fireEvent.change(input, { target: { value: partial } });
      fireEvent.compositionEnd(input, { data: committed });
      await waitFor(() => expect(document.activeElement).toBe(input));
    }

    expect(requestedQueries[requestedQueries.length - 1]).toBe('ひき');
  });
});
