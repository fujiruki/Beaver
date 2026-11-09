import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ProductLedgerModal from '../ProductLedgerModal';

const OLD_BREAKDOWN = [{ category_code: 'MAIN', category_name: '本体', measure_type: 'money', value: 150, sort_order: 0 }];
const FULL = {
  id: 9, code: '00009', name: '元の障子', description: null, unit: '枚', is_favorite: 0, updated_at: '2026-10-09 09:00:00',
  cost_body: 150, cost_hardware: 0, cost_glass: 0, cost_factory_hours: 0, cost_site_hours: 0, cost_labor_rate: 0,
  cost_breakdown: OLD_BREAKDOWN,
  cost_lines: [
    { id: 42, tategu_item_id: 9, category_code: 'MAIN', name: '手入力', quantity: 1, unit_cost: 150, amount: 150, source: 'manual', sort_order: 0 },
  ],
  labor_lines: [],
};

describe('ProductLedgerModal 保存した原価を明細へ反映する', () => {
  it('台帳の古い cost_breakdown を明細へ渡さず、直した原価を渡す', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
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
    const spinbuttons = screen.getAllByLabelText('材料単価') as HTMLInputElement[];
    const unitCost = spinbuttons.find(i => /150/.test(i.value))!;
    fireEvent.change(unitCost, { target: { value: '300' } });
    fireEvent.click(screen.getByRole('button', { name: '保存して明細へ反映' }));
    await waitFor(() => expect(onApplied).toHaveBeenCalled());
    const applied = onApplied.mock.calls[0][0];
    expect(applied.cost_body).toBe(300);
    expect(applied.cost_breakdown?.length ?? 0).toBe(0);
  });
});
