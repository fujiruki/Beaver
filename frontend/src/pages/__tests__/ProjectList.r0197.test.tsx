import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import ProjectList from '../ProjectList';

const projects = [
  { id: 1, project_code: 'P-1', name: '山田邸改修', customer_id: 1, customer_name: '山田建具', status: '進行中', delivery_date: null },
];

const vouchers = [
  { id: 11, voucher_no: 'E00011', voucher_type: 'estimate', status: 'draft', project_id: null, customer_id: 1, customer_name: '山田建具', voucher_date: '2026-10-24', description: '玄関建具', total_amount: 110000 },
  { id: 12, voucher_no: 'S00012', voucher_type: 'sales', status: 'void', project_id: null, customer_id: 1, customer_name: '山田建具', voucher_date: '2026-10-23', description: '取消伝票', total_amount: 220000 },
  { id: 13, voucher_no: 'S00013', voucher_type: 'sales', status: 'billed', project_id: null, customer_id: 1, customer_name: '山田建具', voucher_date: '2026-10-22', description: '請求済伝票', total_amount: 330000 },
  { id: 14, voucher_no: 'E00014', voucher_type: 'estimate', status: 'draft', project_id: null, customer_id: 1, customer_name: '山田建具', voucher_date: '2026-10-21', description: '明細なし', total_amount: 0 },
  { id: 15, voucher_no: 'E00015', voucher_type: 'estimate', status: 'draft', project_id: null, customer_id: 1, customer_name: '山田建具', voucher_date: '2026-10-20', description: '読込失敗', total_amount: 440000 },
];

const details = Object.fromEntries(vouchers.map(voucher => [voucher.id, {
  ...voucher,
  due_date: null,
  delivery_date: null,
  tax_input_type: 'exclusive',
  consumption_tax_type: 'standard',
  override_billing_date: null,
  profit_rate: 37,
  memo: voucher.id === 11 ? '現場搬入前に連絡' : null,
  subtotal_taxable: voucher.total_amount / 1.1,
  tax_amount: voucher.total_amount - voucher.total_amount / 1.1,
  lines: voucher.id === 14 ? [] : [{
    id: voucher.id * 10,
    voucher_id: voucher.id,
    line_no: 1,
    line_type: 'normal',
    location_no: 1,
    location_name: '玄関',
    tategu_item_id: null,
    source_catalog_item_id: null,
    item_name: voucher.id === 11 ? '木製片開き戸' : '試験品',
    quantity: 2,
    cost_body: 54321,
    cost_hardware: 0,
    cost_glass: 0,
    cost_factory_hours: 0,
    cost_site_hours: 0,
    cost_labor_rate: 0,
    snapshot_loaded_at: null,
    price_body: 50000,
    price_hardware: 0,
    price_glass: 0,
    line_total: voucher.total_amount,
    tax_category: 'standard',
    memo: null,
    costs: [],
    prices: [],
  }],
}])) as Record<number, Record<string, unknown>>;

let detailFailures: Set<number>;
let requests: string[];

beforeEach(() => {
  localStorage.clear();
  requests = [];
  detailFailures = new Set();
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
    const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const url = new URL(rawUrl, 'http://localhost');
    requests.push(rawUrl);
    if (url.pathname.endsWith('/customers')) return new Response('[]');
    if (url.pathname.endsWith('/projects')) {
      return new Response(JSON.stringify({ data: projects, meta: { total: 1, page: 1, per_page: 50, last_page: 1 } }));
    }
    if (url.pathname.endsWith('/vouchers')) {
      return new Response(JSON.stringify({ data: vouchers, meta: { total: vouchers.length, page: 1, per_page: 50, last_page: 1 } }));
    }
    const match = url.pathname.match(/\/vouchers\/(\d+)$/);
    if (match) {
      const id = Number(match[1]);
      if (detailFailures.has(id)) return new Response(JSON.stringify({ message: '失敗' }), { status: 500 });
      return new Response(JSON.stringify(details[id]));
    }
    throw new Error(`未処理のリクエスト: ${rawUrl}`);
  }));
});

function LocationView() {
  const location = useLocation();
  const navigate = useNavigate();
  return <><output data-testid="location">{location.pathname}{location.search}</output><button onClick={() => navigate(-1)}>履歴で戻る</button></>;
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/projects?assign=1']}>
        <LocationView />
        <Routes>
          <Route path="/projects" element={<ProjectList />} />
          <Route path="/vouchers/:id" element={<div>伝票画面</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function openVoucher(id: number) {
  const card = await screen.findByTestId(`unlinked-voucher-${id}`);
  fireEvent.doubleClick(card);
  return { card, drawer: await screen.findByRole('dialog') };
}

describe('R-0197 未割り当て伝票の詳細ドロワー', () => {
  it('ダブルクリックで右パネル上のドロワーを開き、判断に必要な詳細と左の案件一覧を表示する', async () => {
    renderPage();
    const { drawer } = await openVoucher(11);

    expect(within(drawer).getByText('E00011')).toBeTruthy();
    expect(within(drawer).getByText('見積')).toBeTruthy();
    expect(within(drawer).getByText('山田建具')).toBeTruthy();
    expect(within(drawer).getByText('玄関建具')).toBeTruthy();
    expect(within(drawer).getByText('全1件')).toBeTruthy();
    expect(within(drawer).getByText('木製片開き戸')).toBeTruthy();
    expect(within(drawer).getByText('¥110,000')).toBeTruthy();
    expect(screen.getByText('山田邸改修')).toBeTruthy();
    expect(drawer.parentElement).toBe(screen.getByTestId('unlinked-vouchers-panel'));
  });

  it('カードにフォーカスしてEnterでも開く', async () => {
    renderPage();
    const card = await screen.findByTestId('unlinked-voucher-11');
    card.focus();
    fireEvent.keyDown(card, { key: 'Enter' });

    expect(await screen.findByRole('dialog')).toBeTruthy();
  });

  it('pointerdownから4pxを超えて動かした操作系列のダブルクリックでは開かない', async () => {
    renderPage();
    const card = await screen.findByTestId('unlinked-voucher-11');
    fireEvent.pointerDown(card, { clientX: 10, clientY: 10 });
    fireEvent.pointerMove(card, { clientX: 15, clientY: 10 });
    fireEvent.pointerUp(card, { clientX: 15, clientY: 10 });
    fireEvent.doubleClick(card);

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('中のクリックでは閉じず、Esc・×・外側クリックで閉じてカードにフォーカスを戻す', async () => {
    renderPage();
    const first = await openVoucher(11);
    fireEvent.click(within(first.drawer).getByText('玄関建具'));
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(first.card);

    const second = await openVoucher(11);
    fireEvent.click(within(second.drawer).getByRole('button', { name: '閉じる' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(second.card);

    const third = await openVoucher(11);
    fireEvent.click(screen.getByTestId('voucher-drawer-backdrop'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(third.card);
  });

  it('取消・請求済み・明細0件・読込失敗と再試行を表示する', async () => {
    renderPage();
    let opened = await openVoucher(12);
    expect(within(opened.drawer).getByText('取消')).toBeTruthy();
    expect(within(opened.drawer).getByText('取消済みの伝票です')).toBeTruthy();
    fireEvent.click(within(opened.drawer).getByRole('button', { name: '閉じる' }));

    opened = await openVoucher(13);
    expect(within(opened.drawer).getByText('請求済み')).toBeTruthy();
    fireEvent.click(within(opened.drawer).getByRole('button', { name: '閉じる' }));

    opened = await openVoucher(14);
    expect(within(opened.drawer).getByText('明細はありません')).toBeTruthy();
    fireEvent.click(within(opened.drawer).getByRole('button', { name: '閉じる' }));

    detailFailures.add(15);
    opened = await openVoucher(15);
    expect(await within(opened.drawer).findByText('伝票の詳細を読み込めませんでした')).toBeTruthy();
    detailFailures.delete(15);
    fireEvent.click(within(opened.drawer).getByRole('button', { name: '再試行' }));
    expect(await within(opened.drawer).findByText('E00015')).toBeTruthy();
    expect(requests.filter(url => url.endsWith('/vouchers/15'))).toHaveLength(2);
  });

  it('伝票画面へ同じタブで移り、履歴でassign=1の案件一覧へ戻れる', async () => {
    renderPage();
    const { drawer } = await openVoucher(11);
    fireEvent.click(within(drawer).getByRole('link', { name: '伝票画面で開く' }));

    expect(screen.getByTestId('location').textContent).toBe('/vouchers/11');
    fireEvent.click(screen.getByRole('button', { name: '履歴で戻る' }));
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/projects?assign=1'));
  });

  it('原価・利益を表示しない', async () => {
    renderPage();
    const { drawer } = await openVoucher(11);

    expect(within(drawer).queryByText(/原価|利益|54,321|37%/)).toBeNull();
  });
});
