import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ProjectList from '../ProjectList';

const projects = [
  { id: 1, project_code: 'P-1', name: '既存案件', customer_id: 1, customer_name: '山田建具', status: '進行中', delivery_date: null },
];
const vouchers = [
  { id: 11, voucher_no: 'E00011', voucher_type: 'estimate', status: 'draft', project_id: null, customer_id: 1, customer_name: '山田建具', voucher_date: '2026-10-24', description: '玄関建具', total_amount: 110000 },
  { id: 12, voucher_no: 'S00012', voucher_type: 'sales', status: 'approved', project_id: null, customer_id: 2, customer_name: '佐藤工務店', voucher_date: '2026-10-23', description: '建具修理', total_amount: 220000 },
  { id: 13, voucher_no: 'S00013', voucher_type: 'sales', status: 'approved', project_id: null, customer_id: 2, customer_name: '佐藤工務店', voucher_date: '2026-10-22', description: '', total_amount: 330000 },
  { id: 14, voucher_no: 'E00014', voucher_type: 'estimate', status: 'draft', project_id: null, customer_id: null, customer_name: null, voucher_date: '2026-10-21', description: '得意先なし', total_amount: 440000 },
];

type RequestRecord = { method: string; url: string; body?: Record<string, unknown> };
let requests: RequestRecord[];
let nextProjectId: number;
let failProjectPost: boolean;
let failVoucherPut: boolean;

beforeEach(() => {
  localStorage.clear();
  requests = [];
  nextProjectId = 101;
  failProjectPost = false;
  failVoucherPut = false;
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const url = new URL(rawUrl, 'http://localhost');
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    requests.push({ method, url: rawUrl, body });
    if (url.pathname.endsWith('/customers')) return new Response('[]');
    if (url.pathname.endsWith('/projects') && method === 'GET') {
      return new Response(JSON.stringify({ data: projects, meta: { total: 1, page: 1, per_page: 50, last_page: 1 } }));
    }
    if (url.pathname.endsWith('/projects') && method === 'POST') {
      if (failProjectPost) return new Response(JSON.stringify({ message: '案件作成失敗' }), { status: 500 });
      return new Response(JSON.stringify({ id: nextProjectId++, ...body }), { status: 201 });
    }
    if (/\/projects\/\d+$/.test(url.pathname) && method === 'DELETE' && url.searchParams.get('hard') === '1') {
      return new Response(JSON.stringify({ deleted: true }));
    }
    if (url.pathname.endsWith('/vouchers') && method === 'GET') {
      return new Response(JSON.stringify({ data: vouchers, meta: { total: vouchers.length, page: 1, per_page: 50, last_page: 1 } }));
    }
    if (/\/vouchers\/\d+$/.test(url.pathname) && method === 'GET') {
      const voucher = vouchers.find(item => url.pathname.endsWith(`/${item.id}`));
      return new Response(JSON.stringify({ ...voucher, lines: [] }));
    }
    if (/\/vouchers\/\d+$/.test(url.pathname) && method === 'PUT') {
      if (failVoucherPut && body?.project_id !== null) return new Response(JSON.stringify({ message: '割り当て失敗' }), { status: 500 });
      const voucher = vouchers.find(item => url.pathname.endsWith(`/${item.id}`));
      return new Response(JSON.stringify({ ...voucher, ...body }));
    }
    throw new Error(`未処理のリクエスト: ${method} ${rawUrl}`);
  }));
});

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/projects?assign=1']}>
        <Routes><Route path="/projects" element={<ProjectList />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function dataTransfer(voucher = vouchers[0]) {
  const values = new Map<string, string>([
    ['text/plain', String(voucher.id)],
    ['application/x-beaver-voucher', JSON.stringify(voucher)],
  ]);
  return {
    effectAllowed: 'move', dropEffect: 'move', files: [], items: [], types: [],
    setData: (type: string, value: string) => values.set(type, value),
    getData: (type: string) => values.get(type) ?? '',
    clearData: () => values.clear(), setDragImage: () => undefined,
  } as unknown as DataTransfer;
}

async function createFromDrawer(voucherId: number) {
  const card = await screen.findByTestId(`unlinked-voucher-${voucherId}`);
  fireEvent.doubleClick(card);
  const drawer = await screen.findByRole('dialog');
  fireEvent.click(await within(drawer).findByRole('button', { name: 'この伝票で案件を作る' }));
}

describe('R-0199 割り当てモードで伝票から案件を作る', () => {
  it('引き出しから得意先・摘要・伝票種別に応じた状態で案件を作り、そのIDだけを伝票へ設定する', async () => {
    renderPage();
    await createFromDrawer(11);
    await waitFor(() => expect(requests.some(request => request.method === 'PUT' && request.url.endsWith('/vouchers/11'))).toBe(true));

    expect(requests.find(request => request.method === 'POST' && request.url.endsWith('/projects'))?.body).toEqual({
      customer_id: 1, name: '玄関建具', status: '見積済',
    });
    const estimatePostIndex = requests.findIndex(request => request.method === 'POST' && request.url.endsWith('/projects'));
    const estimatePutIndex = requests.findIndex(request => request.method === 'PUT' && request.url.endsWith('/vouchers/11'));
    expect(requests[estimatePutIndex].body).toEqual({ project_id: 101 });
    expect(estimatePostIndex).toBeLessThan(estimatePutIndex);

    await createFromDrawer(12);
    await waitFor(() => expect(requests.some(request => request.method === 'PUT' && request.url.endsWith('/vouchers/12'))).toBe(true));
    expect(requests.filter(request => request.method === 'POST' && request.url.endsWith('/projects'))[1].body).toEqual({
      customer_id: 2, name: '建具修理', status: '完了',
    });
  });

  it('摘要が空なら伝票番号を使った案件名にする', async () => {
    renderPage();
    await createFromDrawer(13);

    await waitFor(() => expect(requests.find(request => request.method === 'POST' && request.url.endsWith('/projects'))?.body?.name).toBe('S00013の案件'));
  });

  it('新しい案件の置き場へドラッグしても案件作成と割り当てを行う', async () => {
    renderPage();
    const voucher = await screen.findByTestId('unlinked-voucher-11');
    const dropZone = await screen.findByText('新しい案件にする（ここへ落とす）');
    const transfer = dataTransfer(vouchers[0]);
    fireEvent.dragStart(voucher, { dataTransfer: transfer });
    fireEvent.drop(dropZone, { dataTransfer: transfer });

    await waitFor(() => expect(requests.some(request => request.method === 'PUT' && request.url.endsWith('/vouchers/11') && request.body?.project_id === 101)).toBe(true));
  });

  it('作成後は伝票を消し、元に戻すと伝票を外してから案件を完全削除する', async () => {
    renderPage();
    await createFromDrawer(11);

    await waitFor(() => expect(screen.queryByTestId('unlinked-voucher-11')).toBeNull());
    fireEvent.click(await screen.findByRole('button', { name: '元に戻す' }));
    await waitFor(() => expect(requests.some(request => request.method === 'DELETE' && request.url.includes('/projects/101?hard=1'))).toBe(true));
    const undoPutIndex = requests.findIndex(request => request.method === 'PUT' && request.url.endsWith('/vouchers/11') && request.body?.project_id === null);
    const deleteIndex = requests.findIndex(request => request.method === 'DELETE' && request.url.includes('/projects/101?hard=1'));
    expect(undoPutIndex).toBeGreaterThan(-1);
    expect(undoPutIndex).toBeLessThan(deleteIndex);
  });

  it('得意先未設定ではボタンを押せず、置き場へ落としても何もしない', async () => {
    renderPage();
    const card = await screen.findByTestId('unlinked-voucher-14');
    fireEvent.doubleClick(card);
    const button = await within(await screen.findByRole('dialog')).findByRole('button', { name: 'この伝票で案件を作る' });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    fireEvent.drop(await screen.findByText('新しい案件にする（ここへ落とす）'), { dataTransfer: dataTransfer(vouchers[3]) });

    await waitFor(() => expect(requests.some(request => request.method === 'POST' && request.url.endsWith('/projects'))).toBe(false));
  });

  it('案件作成失敗ではPUTせず、伝票割り当て失敗では作成案件を完全削除する', async () => {
    failProjectPost = true;
    const first = renderPage();
    await createFromDrawer(11);
    await screen.findByText('案件作成失敗');
    expect(requests.some(request => request.method === 'PUT')).toBe(false);
    first.unmount();

    requests = [];
    failProjectPost = false;
    failVoucherPut = true;
    renderPage();
    await createFromDrawer(11);
    await screen.findByText('割り当て失敗');
    await waitFor(() => expect(requests.some(request => request.method === 'DELETE' && request.url.includes('/projects/101?hard=1'))).toBe(true));
  });
});
