import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import VoucherEdit from '../VoucherEdit';
import { AppSettingsProvider } from '../../contexts/AppSettingsContext';

const categories = [
  { id: 1, code: 'MAIN', name: '本体', measure_type: 'money', sort_order: 1 },
  { id: 4, code: 'FACTORY_TIME', name: '工場時間', measure_type: 'time', sort_order: 4 },
  { id: 5, code: 'SITE_TIME', name: '現場時間', measure_type: 'time', sort_order: 5 },
];

const line = {
  id: 51, voucher_id: 5, line_no: 1, line_type: 'normal', location_no: null, location_name: '玄関',
  tategu_item_id: null, source_catalog_item_id: null, item_name: '取付建具', quantity: 3,
  cost_body: 0, cost_hardware: 0, cost_glass: 0, cost_factory_hours: 0, cost_site_hours: 0,
  cost_labor_rate: 7600, snapshot_loaded_at: null, price_body: 0, price_hardware: 0, price_glass: 0,
  line_total: 78000, tax_category: 'taxable', memo: null,
  prices: [{ category_code: 'MAIN', category_name: '本体', measure_type: 'money', value: 26000, sort_order: 1 }],
  costs: [{ category_code: 'MAIN', category_name: '本体', measure_type: 'money', value: 400, sort_order: 1 }],
};

const voucher = {
  id: 5, voucher_no: 'E03981', voucher_type: 'estimate', status: 'draft', project_id: null, customer_id: 1,
  voucher_date: '2026-10-10', delivery_date: null, tax_input_type: 'exclusive', consumption_tax_type: '外税/伝票計',
  override_billing_date: null, trade_type: '掛売上', description: null, profit_rate: 0.3, memo: null,
  sales_category_id: null, validity_period: null, subtotal_taxable: 156000, tax_amount: 15600, total_amount: 171600,
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

beforeEach(() => { localStorage.clear(); window.innerWidth = 1024; stubFetch(); });

describe('R-0275 明細の3段目は 数量・単価・備考', () => {
  it('数量と単価のラベル、単価の表示、常に出ている備考の欄がある', async () => {
    renderPage();
    const row = await screen.findByTestId('line-item-0');
    const third = within(row).getByRole('textbox', { name: '数量' }).closest('[data-testid="line-item-third"]') as HTMLElement;
    expect(third).not.toBeNull();
    const text = third.textContent ?? '';
    expect(text).toContain('数量');
    expect(text).toContain('単価');
    expect(within(third).getByTestId('unit-price').textContent).toBe('¥26,000');
    expect(within(third).getByRole('textbox', { name: '備考' })).not.toBeNull();
    expect(within(row).queryByRole('button', { name: /^備考/ })).toBeNull();
  });

  it('広いとき3段目は左の欄の下から原価・売値の帯の下まで（利益の手前まで）にまたがる', async () => {
    window.innerWidth = 4000;
    renderPage();
    const row = await screen.findByTestId('line-item-0');
    const third = within(row).getByTestId('line-item-third');
    const right = within(row).getByTestId('line-item-right');
    expect(third.style.gridRow).toBe('3');
    expect(third.style.gridColumn).toBe('2 / 6');
    expect(right.style.gridColumn).toBe('5');
    expect(right.style.gridRow).toBe('1 / 3');
    expect(row.style.gridTemplateColumns.split(' ')).toHaveLength(6);
  });

  it('狭いとき帯は左の欄の下へ回り、3段目はその下に来る', async () => {
    window.innerWidth = 1024;
    renderPage();
    const row = await screen.findByTestId('line-item-0');
    const third = within(row).getByTestId('line-item-third');
    const right = within(row).getByTestId('line-item-right');
    expect(row.style.gridTemplateColumns.split(' ')).toHaveLength(4);
    expect(Number(right.style.gridRow)).toBeLessThan(Number(third.style.gridRow));
    expect(right.style.gridColumn).toBe('1 / 5');
  });

  it('DOM の順は 数量・備考 → 種別・台帳 → 帯 → 利益', async () => {
    const user = userEvent.setup();
    renderPage();
    const row = await screen.findByTestId('line-item-0');
    const follows = (a: Element, b: Element) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    const memo = within(row).getByRole('textbox', { name: '備考' });
    const type = within(row).getByRole('combobox', { name: '行種別' });
    const ledger = within(row).getByRole('button', { name: '製品台帳' });
    const right = within(row).getByTestId('line-item-right');
    expect(follows(memo, type)).toBe(true);
    expect(follows(type, ledger)).toBe(true);
    expect(follows(ledger, right)).toBe(true);
    await user.click(memo);
    expect(document.activeElement).toBe(memo);
  });

  it('売値の行には「単価 ¥」を重ねて出さない', async () => {
    renderPage();
    const row = await screen.findByTestId('line-item-0');
    const right = within(row).getByTestId('line-item-right');
    expect(right.textContent).not.toContain('単価 ¥');
    expect(right.textContent).toContain('金額 ¥');
  });

  it('備考に入力できる', async () => {
    const user = userEvent.setup();
    renderPage();
    const row = await screen.findByTestId('line-item-0');
    const memo = within(row).getByRole('textbox', { name: '備考' });
    await user.type(memo, '急ぎ');
    expect((memo as HTMLInputElement).value).toBe('急ぎ');
  });

  it('Tab の順は 取付場所→品名→数量→備考→種別→原価→売値', async () => {
    const user = userEvent.setup();
    renderPage();
    const row = await screen.findByTestId('line-item-0');
    const targets = ['取付場所', '取付製品', '数量', '備考', '行種別', '原価 本体', '売値 本体'];
    within(row).getByRole('textbox', { name: '取付場所' }).focus();
    const seen: string[] = [];
    for (let i = 0; i < 25; i++) {
      const label = document.activeElement?.getAttribute('aria-label') ?? '';
      if (targets.includes(label) && !seen.includes(label)) seen.push(label);
      await user.tab();
    }
    expect(seen).toEqual(targets);
  });
});

