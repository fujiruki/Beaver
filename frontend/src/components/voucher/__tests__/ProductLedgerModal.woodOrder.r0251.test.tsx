import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ProductLedgerModal from '../ProductLedgerModal';

const FULL = {
  id: 9, code: '00009', name: '元の障子', description: null, unit: '枚', is_favorite: 0, updated_at: '2026-10-09 09:00:00',
  cost_body: 150, cost_hardware: 0, cost_glass: 0, cost_factory_hours: 0, cost_site_hours: 0, cost_labor_rate: 0,
  cost_lines: [
    { id: 41, tategu_item_id: 9, category_code: 'MAIN', name: '木材A', quantity: 2, unit_cost: 50, amount: 100, source: 'wood_calc', sort_order: 0 },
    { id: 42, tategu_item_id: 9, category_code: 'MAIN', name: '手入力', quantity: 1, unit_cost: 50, amount: 50, source: 'manual', sort_order: 1 },
  ],
  labor_lines: [],
};

describe('ProductLedgerModal 木材原価の行の番号 (R-0251)', () => {
  it('編集して保存すると、木材原価の行は id 付きで送られる', async () => {
    const calls: { url: string; method: string; body?: string }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method ?? 'GET', body: init?.body as string | undefined });
      if (init?.method === 'PUT') return new Response(JSON.stringify({ ...FULL, ok: true }), { status: 200 });
      if (url.endsWith('/ledger-catalogs')) return new Response('[]', { status: 200 });
      return new Response(JSON.stringify(FULL), { status: 200 });
    }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const onApplied = vi.fn();
    render(
      <QueryClientProvider client={client}>
        <ProductLedgerModal isOpen mode="edit" itemId={9} voucherLabel="見積 E03988" lineNo={5}
          initialName="" categories={[]} onClose={vi.fn()} onApplied={onApplied} />
      </QueryClientProvider>,
    );
    await screen.findByDisplayValue('手入力');
    fireEvent.click(screen.getByRole('button', { name: '保存して明細へ反映' }));
    await waitFor(() => expect(onApplied).toHaveBeenCalled());
    const put = calls.find(c => c.method === 'PUT' && c.url.endsWith('/tategu-items/9/cost-lines'))!;
    const lines = JSON.parse(put.body!).lines;
    expect(lines.find((l: { name: string }) => l.name === '木材A')).toMatchObject({ id: 41, source: 'wood_calc' });
    expect(lines.find((l: { name: string }) => l.name === '手入力').id).toBeUndefined();
  });
});
