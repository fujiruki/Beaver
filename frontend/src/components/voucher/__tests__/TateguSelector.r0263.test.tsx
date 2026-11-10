import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TateguSelector from '../TateguSelector';

const ITEMS = [
  { id: 1, code: '00001', name: '台帳01', description: null, unit: '枚', is_favorite: 1, updated_at: '2026-10-01 09:00:00' },
  { id: 2, code: '00002', name: '台帳02', description: null, unit: '枚', is_favorite: 0, updated_at: '2026-10-02 09:00:00' },
];
const CATALOGS = [{ id: 7, name: '障子カタログ', sort_order: 1, item_count: 0 }];

let calls: string[] = [];

beforeEach(() => {
  calls = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    calls.push(url);
    if (url.endsWith('/ledger-catalogs')) return new Response(JSON.stringify(CATALOGS), { status: 200 });
    return new Response(JSON.stringify(ITEMS), { status: 200 });
  }));
});

function renderSelector(wrap = (el: React.ReactElement) => el) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    wrap(
      <QueryClientProvider client={qc}>
        <TateguSelector isOpen onClose={vi.fn()} onSelect={vi.fn()} />
      </QueryClientProvider>,
    ),
  );
}

const countOf = (suffix: string) => calls.filter(u => u.endsWith(suffix)).length;

describe('TateguSelector 再読み込みボタン (R-0263)', () => {
  it('タブの右端にあり、押すと台帳・カタログを取り直す', async () => {
    renderSelector();
    await screen.findByText('台帳01');
    const tabs = screen.getAllByRole('tab');
    const reload = screen.getByRole('button', { name: '再読み込み' });
    expect(reload.getAttribute('type')).toBe('button');
    expect(reload.parentElement).toBe(tabs[0].parentElement);
    expect(reload.previousElementSibling).toBe(tabs[tabs.length - 1]);
    const itemsBefore = countOf('/tategu-items');
    const catalogsBefore = countOf('/ledger-catalogs');
    fireEvent.click(reload);
    await waitFor(() => {
      expect(countOf('/tategu-items')).toBeGreaterThan(itemsBefore);
      expect(countOf('/ledger-catalogs')).toBeGreaterThan(catalogsBefore);
    });
  });

  it('取り直している間は押せず「読み込み中…」と出る', async () => {
    renderSelector();
    await screen.findByText('台帳01');
    const original = globalThis.fetch;
    let release!: () => void;
    const gate = new Promise<void>(r => (release = r));
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      await gate;
      return original(url, init);
    }));
    fireEvent.click(screen.getByRole('button', { name: '再読み込み' }));
    await waitFor(() => {
      const busy = screen.getByRole('button', { name: '読み込み中…' }) as HTMLButtonElement;
      expect(busy.disabled).toBe(true);
    });
    release();
    await waitFor(() => {
      const idle = screen.getByRole('button', { name: '再読み込み' }) as HTMLButtonElement;
      expect(idle.disabled).toBe(false);
    });
  });
});

describe('TateguSelector 検索欄の × ボタン (R-0263)', () => {
  it('検索語が空のときは出ない', async () => {
    renderSelector();
    await screen.findByText('台帳01');
    expect(screen.queryByRole('button', { name: '検索語を消す' })).toBeNull();
  });

  it('検索語が入ると出て、押すと検索語が消えて検索欄にカーソルが戻る', async () => {
    renderSelector();
    await screen.findByText('台帳01');
    const search = screen.getByPlaceholderText('品番・品名・仕様で検索') as HTMLInputElement;
    fireEvent.change(search, { target: { value: '台帳02' } });
    fireEvent.click(screen.getByRole('tab', { name: 'すべて' }));
    expect(screen.getAllByTestId('ledger-row-name').map(e => e.textContent)).toEqual(['台帳02']);
    const clear = screen.getByRole('button', { name: '検索語を消す' });
    expect(clear.getAttribute('type')).toBe('button');
    search.blur();
    fireEvent.click(clear);
    expect(search.value).toBe('');
    expect(document.activeElement).toBe(search);
    expect(screen.getAllByTestId('ledger-row-name').map(e => e.textContent)).toEqual(['台帳02', '台帳01']);
    expect(screen.queryByRole('button', { name: '検索語を消す' })).toBeNull();
  });

  it('<form> の中で再読み込みと × を押しても onSubmit は呼ばれない', async () => {
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    renderSelector(el => <form onSubmit={onSubmit}>{el}</form>);
    await screen.findByText('台帳01');
    fireEvent.change(screen.getByPlaceholderText('品番・品名・仕様で検索'), { target: { value: '台帳' } });
    fireEvent.click(screen.getByRole('button', { name: '検索語を消す' }));
    fireEvent.click(screen.getByRole('button', { name: '再読み込み' }));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
