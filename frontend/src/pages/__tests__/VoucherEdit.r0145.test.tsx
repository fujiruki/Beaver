import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import VoucherEdit from '../VoucherEdit';
import { AppSettingsProvider } from '../../contexts/AppSettingsContext';

const requests: Array<{ url: string; method: string; body: any }> = [];

function makeLine(overrides: Record<string, any>) {
  return {
    id: overrides.id, voucher_id: 6, line_no: overrides.id, line_type: 'normal',
    location_no: null, location_name: null, tategu_item_id: null,
    source_catalog_item_id: null, item_name: overrides.item_name, quantity: 1,
    cost_body: 0, cost_hardware: 0, cost_glass: 0, cost_factory_hours: 0,
    cost_site_hours: 0, cost_labor_rate: 0, snapshot_loaded_at: null,
    price_body: 0, price_hardware: 0, price_glass: 0, line_total: 0,
    tax_category: 'taxable', memo: null,
    costs: overrides.costs ?? [],
    prices: [],
  };
}

function makeVoucher(lines: any[]) {
  return {
    id: 6, voucher_no: 'V-0006', voucher_type: 'estimate', status: 'draft',
    project_id: null, customer_id: 1, voucher_date: '2026-09-01', delivery_date: null,
    tax_input_type: 'exclusive', consumption_tax_type: '課税', override_billing_date: null,
    profit_rate: 0.3, description: null, memo: null, validity_period: null,
    subtotal_taxable: 0, tax_amount: 0, total_amount: 0, lines,
  };
}

let categories: any[] = [];
let voucherLines: any[] = [];

beforeEach(() => {
  localStorage.clear();
  requests.length = 0;
  categories = [{ id: 1, code: 'MAIN', name: '本体', measure_type: 'money', sort_order: 1 }];
  voucherLines = [makeLine({ id: 1, item_name: '明細1' })];
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    requests.push({ url, method, body });
    if (url.endsWith('/customers')) return new Response(JSON.stringify([{ id: 1, name: '得意先A' }]));
    if (url.endsWith('/projects')) return new Response(JSON.stringify([]));
    if (url.endsWith('/aggregation-categories')) return new Response(JSON.stringify(categories));
    if (url.endsWith('/sales-categories')) return new Response('[]');
    if (url.endsWith('/vouchers/6')) return new Response(JSON.stringify(makeVoucher(voucherLines)));
    if (method === 'POST' && url.endsWith('/vouchers/6/lines')) return new Response(JSON.stringify({ id: 99 }), { status: 201 });
    return new Response('{}');
  }));
});

function renderExisting() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AppSettingsProvider>
        <MemoryRouter initialEntries={['/vouchers/6']}>
          <Routes><Route path="/vouchers/:id" element={<VoucherEdit />} /></Routes>
        </MemoryRouter>
      </AppSettingsProvider>
    </QueryClientProvider>,
  );
}

describe('VoucherEdit R-0145 (A) 既存伝票の労務単価デフォルト値', () => {
  it('既存伝票へ「+ 行を追加」すると設定の既定労務単価がPOSTされる', async () => {
    localStorage.setItem('bv_app_settings', JSON.stringify({ defaultLaborRate: 3000 }));
    const user = userEvent.setup();
    renderExisting();
    await screen.findByDisplayValue('明細1');
    await user.click(screen.getByRole('button', { name: '+ 行を追加' }));
    await waitFor(() => {
      const addPost = requests.find(r => r.method === 'POST' && r.url.endsWith('/vouchers/6/lines'));
      expect(addPost?.body.cost_labor_rate).toBe(3000);
    });
  });

  it('既存伝票へ「行を挿入」すると設定の既定労務単価がPOSTされる', async () => {
    localStorage.setItem('bv_app_settings', JSON.stringify({ defaultLaborRate: 3000 }));
    const user = userEvent.setup();
    renderExisting();
    await screen.findByDisplayValue('明細1');
    await user.click(screen.getByRole('button', { name: '行を挿入' }));
    await waitFor(() => {
      const addPost = requests.find(r => r.method === 'POST' && r.url.endsWith('/vouchers/6/lines'));
      expect(addPost?.body.cost_labor_rate).toBe(3000);
    });
  });
});

describe('VoucherEdit R-0145 (C) 原価から売値を設定ボタンの適用範囲', () => {
  beforeEach(() => {
    voucherLines = [
      makeLine({ id: 1, item_name: '明細1', costs: [{ category_code: 'MAIN', category_name: '本体', measure_type: 'money', value: 1000, sort_order: 1 }] }),
      makeLine({ id: 2, item_name: '明細2', costs: [{ category_code: 'MAIN', category_name: '本体', measure_type: 'money', value: 2000, sort_order: 1 }] }),
    ];
  });

  async function getPriceInputs() {
    const rows = screen.getAllByRole('row');
    // rows[0]=ヘッダー, rows[1]=明細1本体行, rows[2]=明細1備考行, rows[3]=明細2本体行, rows[4]=明細2備考行
    const row1Price = within(rows[1]).getAllByPlaceholderText('本体')[0] as HTMLInputElement;
    const row2Price = within(rows[3]).getAllByPlaceholderText('本体')[0] as HTMLInputElement;
    return { row1Price, row2Price };
  }

  function valueOf(input: HTMLInputElement): number {
    return Number(input.value);
  }

  it('行選択中は選択行のみ更新され、他の行は変化しない', async () => {
    const user = userEvent.setup();
    renderExisting();
    await screen.findByDisplayValue('明細1');

    const radios = screen.getAllByRole('radio');
    await user.click(radios[0]);
    await user.click(screen.getByRole('button', { name: '原価から売値を設定' }));

    const { row1Price, row2Price } = await getPriceInputs();
    await waitFor(() => expect(valueOf(row1Price)).toBe(1400));
    expect(valueOf(row2Price)).toBe(0);
  });

  it('1行適用後、選択状態が次の行へ自動的に移る', async () => {
    const user = userEvent.setup();
    renderExisting();
    await screen.findByDisplayValue('明細1');

    const radios = screen.getAllByRole('radio');
    await user.click(radios[0]);
    await user.click(screen.getByRole('button', { name: '原価から売値を設定' }));

    await waitFor(() => {
      const refreshedRadios = screen.getAllByRole('radio');
      expect((refreshedRadios[0] as HTMLInputElement).checked).toBe(false);
      expect((refreshedRadios[1] as HTMLInputElement).checked).toBe(true);
    });
  });

  it('最終行を選択中に適用しても選択状態は変わらない', async () => {
    const user = userEvent.setup();
    renderExisting();
    await screen.findByDisplayValue('明細1');

    const radios = screen.getAllByRole('radio');
    await user.click(radios[1]);
    await user.click(screen.getByRole('button', { name: '原価から売値を設定' }));

    const { row2Price } = await getPriceInputs();
    await waitFor(() => expect(valueOf(row2Price)).toBe(2900));
    const refreshedRadios = screen.getAllByRole('radio');
    expect((refreshedRadios[1] as HTMLInputElement).checked).toBe(true);
  });

  it('未選択時は確認ダイアログが出て、OKなら全行に適用される', async () => {
    const confirmMock = vi.fn(() => true);
    vi.stubGlobal('confirm', confirmMock);
    const user = userEvent.setup();
    renderExisting();
    await screen.findByDisplayValue('明細1');

    await user.click(screen.getByRole('button', { name: '原価から売値を設定' }));

    expect(confirmMock).toHaveBeenCalledWith('行が選択されていません。全行に適用します。よろしいですか？');
    const { row1Price, row2Price } = await getPriceInputs();
    await waitFor(() => expect(valueOf(row1Price)).toBe(1400));
    expect(valueOf(row2Price)).toBe(2900);
  });

  it('未選択時に確認ダイアログでキャンセルすると何も変わらない', async () => {
    const confirmMock = vi.fn(() => false);
    vi.stubGlobal('confirm', confirmMock);
    const user = userEvent.setup();
    renderExisting();
    await screen.findByDisplayValue('明細1');

    await user.click(screen.getByRole('button', { name: '原価から売値を設定' }));

    expect(confirmMock).toHaveBeenCalled();
    const { row1Price, row2Price } = await getPriceInputs();
    expect(valueOf(row1Price)).toBe(0);
    expect(valueOf(row2Price)).toBe(0);
  });
});
