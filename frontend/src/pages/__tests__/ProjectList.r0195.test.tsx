import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import ProjectList from '../ProjectList';

const projects = [
  { id: 1, project_code: 'P-1', name: '山田邸改修', customer_id: 1, customer_name: '山田建具', status: '進行中', delivery_date: null },
  { id: 2, project_code: 'P-2', name: '佐藤邸新築', customer_id: 2, customer_name: '佐藤工務店', status: '見積済', delivery_date: null },
];
const vouchers = [
  { id: 11, voucher_no: 'E00011', voucher_type: 'estimate', status: 'draft', project_id: null, customer_id: 1, customer_name: '山田建具', voucher_date: '2026-10-24', description: '玄関建具', total_amount: 110000 },
  { id: 12, voucher_no: 'S00012', voucher_type: 'sales', status: 'approved', project_id: null, customer_id: 2, customer_name: '佐藤工務店', voucher_date: '2026-10-23', description: '検索用摘要', total_amount: 220000 },
];

let requests: Array<{ method: string; url: string; body?: Record<string, unknown> }>;

beforeEach(() => {
  localStorage.clear();
  requests = [];
  vi.stubGlobal('confirm', vi.fn(() => true));
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const url = new URL(rawUrl, 'http://localhost');
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    requests.push({ method, url: rawUrl, body });
    if (url.pathname.endsWith('/customers')) return new Response('[]');
    if (url.pathname.endsWith('/projects')) {
      return new Response(JSON.stringify({ data: projects, meta: { total: 2, page: 1, per_page: 50, last_page: 1 } }));
    }
    if (url.pathname.endsWith('/vouchers') && method === 'GET') {
      return new Response(JSON.stringify({ data: vouchers, meta: { total: 2, page: 1, per_page: 50, last_page: 1 } }));
    }
    if (/\/vouchers\/\d+$/.test(url.pathname) && method === 'PUT') {
      return new Response(JSON.stringify({ ...vouchers.find(v => url.pathname.endsWith(`/${v.id}`)), ...body }));
    }
    throw new Error(`未処理のリクエスト: ${method} ${rawUrl}`);
  }));
});

function LocationView() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}</output>;
}

function renderPage(initialEntry = '/projects') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <LocationView />
        <Routes>
          <Route path="/projects" element={<ProjectList />} />
          <Route path="/projects/new" element={<div>案件 新規登録画面</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function dataTransfer() {
  const values = new Map<string, string>();
  return {
    effectAllowed: 'move', dropEffect: 'move', files: [], items: [], types: [],
    setData: (type: string, value: string) => values.set(type, value),
    getData: (type: string) => values.get(type) ?? '',
    clearData: () => values.clear(), setDragImage: () => undefined,
  } as unknown as DataTransfer;
}

describe('R-0195 案件一覧の伝票割り当てモード', () => {
  it('ボタンでassign=1になり、案件なし伝票と新規登録への戻り先クエリを表示する', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: '伝票の割り当て' }));

    await screen.findByText('E00011');
    expect(screen.getByTestId('location').textContent).toContain('/projects?assign=1');
    const voucherRequest = requests.find(r => r.method === 'GET' && r.url.includes('/vouchers?'));
    expect(new URL(voucherRequest!.url, 'http://localhost').searchParams.get('no_project')).toBe('1');

    fireEvent.click(screen.getByRole('button', { name: '＋ 新規登録' }));
    expect(screen.getByTestId('location').textContent).toBe('/projects/new?assign=1');
  });

  it('?assign=1で直接開くと割り当てモードになる', async () => {
    renderPage('/projects?assign=1');
    expect(await screen.findByText('未割り当て伝票')).toBeTruthy();
    expect(await screen.findByText('E00011')).toBeTruthy();
  });

  it('伝票を案件へ落とすとproject_id付きPUT、一覧除去、UndoでnullのPUTを行う', async () => {
    renderPage('/projects?assign=1');
    const voucher = await screen.findByTestId('unlinked-voucher-11');
    const project = await screen.findByTestId('assign-project-1');
    const transfer = dataTransfer();

    fireEvent.dragStart(voucher, { dataTransfer: transfer });
    fireEvent.dragOver(project, { dataTransfer: transfer });
    fireEvent.drop(project, { dataTransfer: transfer });

    await waitFor(() => expect(requests.some(r => r.method === 'PUT' && r.url.endsWith('/vouchers/11') && JSON.stringify(r.body) === JSON.stringify({ project_id: 1 }))).toBe(true));
    await waitFor(() => expect(screen.queryByTestId('unlinked-voucher-11')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: '元に戻す' }));
    await waitFor(() => expect(requests.some(r => r.method === 'PUT' && r.url.endsWith('/vouchers/11') && JSON.stringify(r.body) === JSON.stringify({ project_id: null }))).toBe(true));
  });

  it('得意先が違う場合は確認し、キャンセルならPUTしない', async () => {
    vi.mocked(confirm).mockReturnValue(false);
    renderPage('/projects?assign=1');
    const voucher = await screen.findByTestId('unlinked-voucher-11');
    const project = await screen.findByTestId('assign-project-2');
    const transfer = dataTransfer();

    fireEvent.dragStart(voucher, { dataTransfer: transfer });
    fireEvent.drop(project, { dataTransfer: transfer });

    expect(confirm).toHaveBeenCalledWith('得意先が違います（伝票: 山田建具 ／ 案件: 佐藤工務店）。この案件に入れますか');
    expect(requests.some(r => r.method === 'PUT')).toBe(false);
  });

  it('見積／売上切り替えと得意先・摘要・伝票番号の検索で絞り込む', async () => {
    renderPage('/projects?assign=1');
    const panel = await screen.findByTestId('unlinked-vouchers-panel');
    await within(panel).findByText('E00011');

    fireEvent.click(within(panel).getByRole('button', { name: '売上' }));
    expect(await within(panel).findByText('S00012')).toBeTruthy();
    expect(within(panel).queryByText('E00011')).toBeNull();

    fireEvent.click(within(panel).getByRole('button', { name: '両方' }));
    const search = within(panel).getByPlaceholderText('得意先・摘要・伝票番号で検索');
    fireEvent.change(search, { target: { value: '玄関' } });
    expect(await within(panel).findByText('E00011')).toBeTruthy();
    expect(within(panel).queryByText('S00012')).toBeNull();
    fireEvent.change(search, { target: { value: 'S00012' } });
    expect(await within(panel).findByText('S00012')).toBeTruthy();
    expect(within(panel).queryByText('E00011')).toBeNull();
  });
});
