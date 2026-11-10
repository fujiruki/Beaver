import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import VoucherEdit from '../VoucherEdit';
import { AppSettingsProvider } from '../../contexts/AppSettingsContext';

const categories = [
  { id: 1, code: 'MAIN', name: '本体', measure_type: 'money', sort_order: 1 },
  { id: 2, code: 'HARDWARE', name: '金物', measure_type: 'money', sort_order: 2 },
  { id: 3, code: 'GLASS', name: 'ガラス', measure_type: 'money', sort_order: 3 },
  { id: 4, code: 'FACTORY_TIME', name: '工場時間', measure_type: 'time', sort_order: 4 },
  { id: 5, code: 'SITE_TIME', name: '現場時間', measure_type: 'time', sort_order: 5 },
];

const line = {
  id: 51, voucher_id: 5, line_no: 1, line_type: 'normal', location_no: null, location_name: '玄関',
  tategu_item_id: null, source_catalog_item_id: null, item_name: '取付建具', quantity: 3,
  cost_body: 0, cost_hardware: 0, cost_glass: 0, cost_factory_hours: 0, cost_site_hours: 0,
  cost_labor_rate: 7600, snapshot_loaded_at: null, price_body: 0, price_hardware: 0, price_glass: 0,
  line_total: 79800, tax_category: 'taxable', memo: null,
  prices: [{ category_code: 'MAIN', category_name: '本体', measure_type: 'money', value: 26000, sort_order: 1 }],
  costs: [{ category_code: 'MAIN', category_name: '本体', measure_type: 'money', value: 400, sort_order: 1 }],
};

const voucher = {
  id: 5, voucher_no: 'E03981', voucher_type: 'estimate', status: 'draft', project_id: null, customer_id: 1,
  voucher_date: '2026-10-10', delivery_date: null, tax_input_type: 'exclusive', consumption_tax_type: '外税/伝票計',
  override_billing_date: null, trade_type: '掛売上', description: null, profit_rate: 0.3, memo: null,
  sales_category_id: null, validity_period: null, subtotal_taxable: 79800, tax_amount: 7980, total_amount: 87780,
  updated_at: '2026-10-10 09:00:00', lines: [line, { ...line, id: 52, line_no: 2 }], converted_sales: [],
  access_voucher_id: null, access_billed_flag: 0, access_billing_date: null, last_synced_at: null, sync_pending: 0,
};

function stubFetch() {
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith('/customers')) return new Response(JSON.stringify([{ id: 1, name: '得意先A' }]));
    if (url.endsWith('/aggregation-categories')) return new Response(JSON.stringify(categories));
    if (url.endsWith('/projects') || url.endsWith('/sales-categories')) return new Response('[]');
    if (url.endsWith('/vouchers/5')) return new Response(JSON.stringify(voucher));
    return new Response('{}');
  }));
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const router = createMemoryRouter([{ path: '/vouchers/:id', element: <VoucherEdit /> }], { initialEntries: ['/vouchers/5'] });
  return render(
    <QueryClientProvider client={client}>
      <AppSettingsProvider><RouterProvider router={router} /></AppSettingsProvider>
    </QueryClientProvider>,
  );
}

const ready = async () => {
  const summary = await screen.findByTestId('top-summary');
  await screen.findByTestId('line-item-0');
  return summary;
};
const follows = (a: Element, b: Element) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
const opNames = ['製品複製', '行を挿入', '行を削除', '▲', '▼', '原価から売値を設定'];

beforeEach(() => { localStorage.clear(); stubFetch(); });

describe('R-0267 操作の列はどの幅でも明細の右', () => {
  const originalWidth = window.innerWidth;
  afterEach(() => { window.innerWidth = originalWidth; });

  for (const width of [800, 1024, 1280, 1440, 1920]) {
    it(`${width}px: 操作のボタンは操作の列にあり、サマリーの中にも明細の上の帯にも無い`, async () => {
      window.innerWidth = width;
      renderPage();
      const summary = await ready();
      const ops = screen.getByTestId('ops-side');
      const band = screen.getByTestId('line-item-sticky');
      for (const name of opNames) {
        const buttons = screen.getAllByRole('button', { name });
        expect(buttons).toHaveLength(1);
        expect(ops.contains(buttons[0])).toBe(true);
        expect(summary.contains(buttons[0])).toBe(false);
        expect(band.contains(buttons[0])).toBe(false);
      }
      expect(follows(screen.getByTestId('line-item-0'), ops)).toBe(true);
    });
  }

  it('操作の列は縦スクロールについてきて、細い', async () => {
    window.innerWidth = 1280;
    renderPage();
    await ready();
    const ops = screen.getByTestId('ops-side');
    expect(ops.style.position).toBe('sticky');
    expect(ops.style.maxHeight).toContain('100vh');
    expect(ops.style.overflowY).toBe('auto');
    expect(parseInt(ops.style.width)).toBeGreaterThanOrEqual(96);
    expect(parseInt(ops.style.width)).toBeLessThanOrEqual(120);
  });

  it('ボタンは縦に積む', async () => {
    window.innerWidth = 1280;
    renderPage();
    await ready();
    const dup = screen.getByRole('button', { name: '製品複製' });
    expect(dup.parentElement!.style.flexDirection).toBe('column');
  });
});

describe('R-0267 サマリーは幅に余裕があるときだけ右', () => {
  const originalWidth = window.innerWidth;
  afterEach(() => { window.innerWidth = originalWidth; });

  it('1920px: 右（sticky）', async () => {
    window.innerWidth = 1920;
    renderPage();
    const summary = await ready();
    const side = screen.getByTestId('summary-side');
    expect(side.contains(summary)).toBe(true);
    expect(side.style.position).toBe('sticky');
  });

  for (const width of [800, 1024, 1280, 1440]) {
    it(`${width}px: 明細の上`, async () => {
      window.innerWidth = width;
      renderPage();
      const summary = await ready();
      expect(screen.queryByTestId('summary-side')).toBeNull();
      expect(follows(summary, screen.getByTestId('line-item-0'))).toBe(true);
    });
  }
});

describe('R-0267 明細は横スクロール禁止で、折り返す', () => {
  it('明細の領域は overflow-x を出さず、行も見出しも折り返す', async () => {
    window.innerWidth = 1280;
    renderPage();
    await ready();
    const scroller = screen.getByTestId('line-item-scroll');
    expect(['', 'visible']).toContain(scroller.style.overflowX);
    expect(['', 'visible']).toContain(scroller.style.overflow);
    const row = screen.getByTestId('line-item-0');
    const heading = screen.getByTestId('line-item-heading');
    expect(row.style.flexWrap).toBe('wrap');
    expect(heading.style.flexWrap).toBe('wrap');
    expect(row.style.minWidth).toBe('');
    expect(within(scroller).queryByTestId('line-item-heading')).toBeNull();
  });

  it('見出しと行は同じ幅の部品を同じ順に並べる（折り返しがそろう）', async () => {
    renderPage();
    await ready();
    const row = screen.getByTestId('line-item-0');
    const heading = screen.getByTestId('line-item-heading');
    const widths = (el: HTMLElement) => Array.from(el.children).map(c => (c as HTMLElement).style.width);
    expect(widths(heading)).toEqual(widths(row));
  });
});
