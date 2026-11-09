import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TateguSelector from '../TateguSelector';

const ITEMS = [{ id: 1, code: '00001', name: '台帳01', description: null, unit: '枚', is_favorite: 0, updated_at: '2026-10-01 09:00:00' }];

describe('TateguSelector を form の中に描いたとき (R-0252)', () => {
  it('タブ・☆・✕を押しても form が送信されない', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/ledger-catalogs')) return new Response('[]', { status: 200 });
      if (url.includes('/favorite')) return new Response('{"ok":true}', { status: 200 });
      return new Response(JSON.stringify(ITEMS), { status: 200 });
    }));
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <form onSubmit={onSubmit}>
          <TateguSelector isOpen onClose={vi.fn()} onSelect={vi.fn()} />
        </form>
      </QueryClientProvider>,
    );
    await screen.findByText('台帳01');
    for (const tab of screen.getAllByRole('tab')) fireEvent.click(tab);
    fireEvent.click(screen.getAllByRole('button', { name: 'お気に入りにする' })[0]);
    fireEvent.click(screen.getByText('✕'));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
