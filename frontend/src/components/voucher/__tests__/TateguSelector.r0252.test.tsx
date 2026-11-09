import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TateguSelector from '../TateguSelector';

const pad = (n: number) => String(n).padStart(2, '0');
const ITEMS = Array.from({ length: 12 }, (_, i) => ({
  id: i + 1,
  code: `000${pad(i + 1)}`,
  name: `台帳${pad(i + 1)}`,
  description: null,
  unit: '枚',
  is_favorite: i + 1 === 1 || i + 1 === 2 ? 1 : 0,
  updated_at: `2026-10-${pad(i + 1)} 09:00:00`,
}));
const CATALOGS = [
  { id: 7, name: '障子カタログ', sort_order: 1, item_count: 2 },
  { id: 8, name: '框カタログ', sort_order: 2, item_count: 0 },
];

let calls: { url: string; method: string; body?: string }[] = [];

beforeEach(() => {
  calls = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method ?? 'GET', body: init?.body as string | undefined });
    if (url.endsWith('/ledger-catalogs')) return new Response(JSON.stringify(CATALOGS), { status: 200 });
    if (url.endsWith('/ledger-catalogs/7/items')) return new Response(JSON.stringify([ITEMS[4], ITEMS[0]]), { status: 200 });
    if (url.includes('/favorite')) return new Response(JSON.stringify({ ok: true }), { status: 200 });
    return new Response(JSON.stringify(ITEMS), { status: 200 });
  }));
});

function renderSelector(onSelect = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <TateguSelector isOpen onClose={vi.fn()} onSelect={onSelect} />
    </QueryClientProvider>,
  );
  return onSelect;
}

describe('TateguSelector タブ (R-0252)', () => {
  it('タブは 最近・お気に入り・カタログ・すべて の順で、開いたときは最近', async () => {
    renderSelector();
    await screen.findByText('台帳12');
    const tabs = screen.getAllByRole('tab').map(t => t.textContent);
    expect(tabs).toEqual(['最近', 'お気に入り', '障子カタログ', '框カタログ', 'すべて']);
    expect(screen.getByRole('tab', { name: '最近' }).getAttribute('aria-selected')).toBe('true');
  });

  it('最近は updated_at の新しい順に上位10件', async () => {
    renderSelector();
    await screen.findByText('台帳12');
    const names = screen.getAllByTestId('ledger-row-name').map(e => e.textContent);
    expect(names).toEqual(['台帳12', '台帳11', '台帳10', '台帳09', '台帳08', '台帳07', '台帳06', '台帳05', '台帳04', '台帳03']);
  });

  it('お気に入りのタブはお気に入りだけを最近更新した順に出す', async () => {
    renderSelector();
    await screen.findByText('台帳12');
    fireEvent.click(screen.getByRole('tab', { name: 'お気に入り' }));
    const names = screen.getAllByTestId('ledger-row-name').map(e => e.textContent);
    expect(names).toEqual(['台帳02', '台帳01']);
  });

  it('カタログのタブはカタログの順番どおりに出す', async () => {
    renderSelector();
    await screen.findByText('台帳12');
    fireEvent.click(screen.getByRole('tab', { name: '障子カタログ' }));
    await waitFor(() => {
      const names = screen.getAllByTestId('ledger-row-name').map(e => e.textContent);
      expect(names).toEqual(['台帳05', '台帳01']);
    });
  });

  it('すべてのタブは全件が対象で、検索は今のタブの中だけを探す', async () => {
    renderSelector();
    await screen.findByText('台帳12');
    const search = screen.getByPlaceholderText('品番・品名・仕様で検索');
    fireEvent.change(search, { target: { value: '台帳01' } });
    expect(screen.queryAllByTestId('ledger-row-name')).toHaveLength(0);
    fireEvent.click(screen.getByRole('tab', { name: 'すべて' }));
    const names = screen.getAllByTestId('ledger-row-name').map(e => e.textContent);
    expect(names).toEqual(['台帳01']);
  });

  it('行の ☆ を押すとお気に入りに切り替わり、行の選択は起きない', async () => {
    const onSelect = renderSelector();
    await screen.findByText('台帳12');
    const row = screen.getByText('台帳12').closest('tr') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: 'お気に入りにする' }));
    await waitFor(() => {
      const put = calls.find(c => c.method === 'PUT' && c.url.endsWith('/tategu-items/12/favorite'));
      expect(put).toBeTruthy();
      expect(JSON.parse(put!.body!)).toEqual({ is_favorite: true });
    });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('行を押すとその台帳を選ぶ', async () => {
    const onSelect = renderSelector();
    fireEvent.click(await screen.findByText('台帳12'));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 12 }));
  });
});
