import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  prices: [
    { category_code: 'MAIN', category_name: '本体', measure_type: 'money', value: 26000, sort_order: 1 },
    { category_code: 'HARDWARE', category_name: '金物', measure_type: 'money', value: 400, sort_order: 2 },
    { category_code: 'GLASS', category_name: 'ガラス', measure_type: 'money', value: 200, sort_order: 3 },
  ],
  costs: [
    { category_code: 'MAIN', category_name: '本体', measure_type: 'money', value: 400, sort_order: 1 },
    { category_code: 'HARDWARE', category_name: '金物', measure_type: 'money', value: 0, sort_order: 2 },
    { category_code: 'GLASS', category_name: 'ガラス', measure_type: 'money', value: 0, sort_order: 3 },
    { category_code: 'FACTORY_TIME', category_name: '工場h', measure_type: 'time', value: 4, sort_order: 4 },
    { category_code: 'SITE_TIME', category_name: '現場h', measure_type: 'time', value: 2, sort_order: 5 },
  ],
};

const voucher = {
  id: 5, voucher_no: 'E03981', voucher_type: 'estimate', status: 'draft', project_id: null, customer_id: 1,
  voucher_date: '2026-10-10', delivery_date: null, tax_input_type: 'exclusive', consumption_tax_type: '外税/伝票計',
  override_billing_date: null, trade_type: '掛売上', description: null, profit_rate: 0.3, memo: null,
  sales_category_id: null, validity_period: null, subtotal_taxable: 79800, tax_amount: 7980, total_amount: 87780,
  updated_at: '2026-10-10 09:00:00', lines: [line, { ...line, id: 52, line_no: 2 }], converted_sales: [],
  access_voucher_id: null, access_billed_flag: 0, access_billing_date: null, last_synced_at: null, sync_pending: 0,
};

const puts: any[] = [];

function stubFetch() {
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    if (url.endsWith('/customers')) return new Response(JSON.stringify([{ id: 1, name: '得意先A' }]));
    if (url.endsWith('/aggregation-categories')) return new Response(JSON.stringify(categories));
    if (url.endsWith('/projects') || url.endsWith('/sales-categories')) return new Response('[]');
    if (method === 'PUT' && /\/vouchers\/5\/lines\/\d+$/.test(url)) {
      puts.push(body);
      return new Response(JSON.stringify({ ...line, ...body, voucher_updated_at: '2026-10-10 09:00:02' }));
    }
    if (url.endsWith('/vouchers/5')) return new Response(JSON.stringify(voucher));
    return new Response('{}');
  }));
}

function renderPage(readOnly = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const router = createMemoryRouter([
    { path: '/vouchers/:id', element: <VoucherEdit /> },
  ], { initialEntries: [`/vouchers/5${readOnly ? '?readonly=1' : ''}`] });
  return render(
    <QueryClientProvider client={client}>
      <AppSettingsProvider><RouterProvider router={router} /></AppSettingsProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  puts.length = 0;
  stubFetch();
});

describe('R-0184 明細入力レイアウト F3 詰め版', () => {
  it('必要な入力と計算結果を明細1行に表示する', async () => {
    renderPage();
    const row = await screen.findByTestId('line-item-0');

    await waitFor(() => expect((within(row).getByRole('textbox', { name: '取付製品' }) as HTMLTextAreaElement).value).toBe('取付建具'));
    expect((within(row).getByRole('textbox', { name: '取付場所' }) as HTMLInputElement).value).toBe('玄関');
    expect((within(row).getByRole('textbox', { name: '数量' }) as HTMLInputElement).value).toBe('3');
    for (const name of ['売値 本体', '売値 金物', '売値 ガラス', '原価 本体', '原価 金物', '原価 ガラス', '工場h', '現場h', '労務単価']) {
      expect(within(row).getByRole('textbox', { name })).not.toBeNull();
    }
    for (const label of ['単価', '金額', '材料原価', '労務費', '製造原価', '利益', '利益率', '粗利率', '日割粗利']) {
      expect(within(row).getByText(new RegExp(`^${label}(?:\\s|$)`))).not.toBeNull();
    }
    const calculationResults = ['材料原価', '労務費', '製造原価'].map(label =>
      within(row).getByText(new RegExp(`^${label}`)),
    );
    expect(calculationResults[0].compareDocumentPosition(calculationResults[1]) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(calculationResults[1].compareDocumentPosition(calculationResults[2]) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
  });

  it('区分名は見出しだけに1回表示し、2行の明細内には表示しない', async () => {
    renderPage();
    const heading = await screen.findByTestId('line-item-heading');
    const rows = await screen.findAllByTestId(/^line-item-\d+$/);

    for (const name of ['本体', '金物', 'ガラス', '工場h', '現場h', '労務単価']) {
      expect(within(heading).getAllByText(name)).toHaveLength(1);
      for (const row of rows) expect(within(row).queryByText(name)).toBeNull();
    }
  });

  it('作業区分の末尾の「時間」は見出しと入力名で「h」にする', async () => {
    renderPage();
    const heading = await screen.findByTestId('line-item-heading');
    const row = await screen.findByTestId('line-item-0');

    expect(within(heading).getByText('工場h')).not.toBeNull();
    expect(within(heading).getByText('現場h')).not.toBeNull();
    expect(within(heading).queryByText('工場時間')).toBeNull();
    expect(within(heading).queryByText('現場時間')).toBeNull();
    expect(within(row).getByRole('textbox', { name: '工場h' })).not.toBeNull();
    expect(within(row).getByRole('textbox', { name: '現場h' })).not.toBeNull();
  });

  it('見出しと明細は同じグリッド定義を使って区分列をそろえる', async () => {
    renderPage();
    const headingGrid = await screen.findByTestId('category-grid-heading');
    const rowGrid = await screen.findByTestId('category-grid-row-0');

    expect(headingGrid.style.display).toBe('grid');
    expect(rowGrid.style.display).toBe('grid');
    expect(headingGrid.style.gridTemplateColumns).not.toBe('');
    expect(headingGrid.style.gridTemplateColumns).toBe(rowGrid.style.gridTemplateColumns);
  });

  it('行種別は最長の選択肢と矢印が収まる幅を持つ', async () => {
    renderPage();
    const row = await screen.findByTestId('line-item-0');
    const lineType = within(row).getByRole('combobox', { name: '行種別' });

    expect(Number.parseFloat(lineType.style.width)).toBeGreaterThanOrEqual(72);
  });

  it('備考を開くと右のまとまりの下に幅いっぱいの入力欄を表示する', async () => {
    const user = userEvent.setup();
    renderPage();
    const row = await screen.findByTestId('line-item-0');

    await user.click(within(row).getByRole('button', { name: '備考 ＋' }));

    const rightGroup = within(row).getByTestId('line-item-right');
    const memo = within(rightGroup).getByRole('textbox', { name: '備考' });
    expect(memo.style.width).toBe('100%');
    expect(memo.style.height).toBe('20px');
    expect(within(row).getByTestId('line-item-left').contains(memo)).toBe(false);
  });

  it('意味のまとまりごとに外枠を共有し、内側の入力欄に個別の枠線を持たない', async () => {
    renderPage();
    const row = await screen.findByTestId('line-item-0');

    for (const testId of ['location-quantity-group', 'price-group', 'cost-group', 'work-group', 'tax-group']) {
      const group = within(row).getByTestId(testId);
      expect(group.style.border).toBe('1px solid #b6bdc6');
      expect(group.style.borderRadius).toBe('5px');
      expect(group.style.overflow).toBe('hidden');
      expect(group.style.background).toBe('#fff');

      for (const input of group.querySelectorAll<HTMLElement>('input, select')) {
        expect(input.style.border).toBe('0px');
        expect(input.style.borderRadius).toBe('0px');
      }
    }
  });

  it('金額入力は3桁区切りで表示し、blur保存では数値に戻す', async () => {
    const user = userEvent.setup();
    renderPage();
    const row = await screen.findByTestId('line-item-0');
    const price = within(row).getByRole('textbox', { name: '売値 本体' });

    await waitFor(() => expect((price as HTMLInputElement).value).toBe('26,000'));
    await user.clear(price);
    await user.type(price, '35000');
    await user.tab();

    await waitFor(() => expect(puts.length).toBeGreaterThan(0));
    expect(puts.at(-1).prices.find((value: any) => value.category_code === 'MAIN').value).toBe(35000);
  });

  it('読み取り専用の伝票では明細を入力できない', async () => {
    renderPage(true);
    const row = await screen.findByTestId('line-item-0');
    const inputs = [
      ...within(row).getAllByRole('textbox'),
      ...within(row).getAllByRole('combobox'),
    ];

    expect(inputs.length).toBeGreaterThan(0);
    for (const input of inputs) expect((input as HTMLInputElement).disabled).toBe(true);
  });
});
