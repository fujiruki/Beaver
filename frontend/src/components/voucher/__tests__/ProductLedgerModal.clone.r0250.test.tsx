import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ProductLedgerModal from '../ProductLedgerModal';

const LIST = [
  { id: 9, code: '00009', name: '元の障子', description: null, unit: '枚', is_favorite: 0, updated_at: '2026-10-09 09:00:00' },
  { id: 8, code: '00008', name: '別の框', description: null, unit: '枚', is_favorite: 0, updated_at: '2026-10-08 09:00:00' },
];
const FULL = {
  ...LIST[0],
  cost_body: 100, cost_hardware: 0, cost_glass: 0, cost_factory_hours: 0, cost_site_hours: 0, cost_labor_rate: 0,
  cost_lines: [{ id: 1, tategu_item_id: 9, category_code: 'MAIN', name: '桟', quantity: 2, unit_cost: 50, amount: 100, source: 'wood_calc', sort_order: 0 }],
  labor_lines: [],
};

let calls: { url: string; method: string; body?: string }[] = [];

beforeEach(() => {
  calls = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method ?? 'GET', body: init?.body as string | undefined });
    if (init?.method === 'POST') return new Response(JSON.stringify({ ...FULL, id: 10, code: null }), { status: 201 });
    if (init?.method === 'PUT') return new Response(JSON.stringify({ ok: true }), { status: 200 });
    if (url.endsWith('/ledger-catalogs')) return new Response('[]', { status: 200 });
    if (url.endsWith('/tategu-items/9')) return new Response(JSON.stringify(FULL), { status: 200 });
    return new Response(JSON.stringify(LIST), { status: 200 });
  }));
});

function renderModal(mode: 'create' | 'edit' = 'create', onApplied = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ProductLedgerModal
        isOpen mode={mode} voucherLabel="見積 E03988" lineNo={5} initialName="トイレブース扉"
        categories={[]} onClose={vi.fn()} onApplied={onApplied}
      />
    </QueryClientProvider>,
  );
  return onApplied;
}

describe('ProductLedgerModal 既存の台帳から引用 (R-0250)', () => {
  it('新しく作るときだけ「既存の台帳から引用」が出る', () => {
    renderModal('create');
    expect(screen.getByRole('button', { name: '既存の台帳から引用' })).toBeTruthy();
  });

  it('選ぶ画面で1件選ぶと中身が入り、保存すると新しい台帳ができる（製品№なし・手入力の行）', async () => {
    const onApplied = renderModal('create');
    fireEvent.click(screen.getByRole('button', { name: '既存の台帳から引用' }));
    fireEvent.click(await screen.findByText('元の障子'));
    expect(await screen.findByText('（引用元 製品№ 00009）')).toBeTruthy();
    expect((screen.getByLabelText('製品名') as HTMLInputElement).value).toBe('元の障子');
    expect(screen.getByDisplayValue('桟')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '保存して明細へ反映' }));
    await waitFor(() => expect(onApplied).toHaveBeenCalled());
    const post = calls.find(c => c.method === 'POST' && c.url.endsWith('/tategu-items'))!;
    expect(JSON.parse(post.body!).code).toBeNull();
    expect(JSON.parse(post.body!).name).toBe('元の障子');
    const put = calls.find(c => c.method === 'PUT' && c.url.endsWith('/tategu-items/10/cost-lines'))!;
    expect(JSON.parse(put.body!).lines[0]).toMatchObject({ name: '桟', source: 'manual' });
    expect(calls.some(c => c.method === 'PUT' && c.url.endsWith('/tategu-items/9'))).toBe(false);
  });
});
