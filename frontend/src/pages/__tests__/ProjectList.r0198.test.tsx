import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import ProjectList from '../ProjectList';

const customers = [
  { id: 1, name: '山田建具' },
  { id: 2, name: '佐藤工務店' },
];
const projects = [
  { id: 1, project_code: 'P-1', name: '山田邸改修', customer_id: 1, customer_name: '山田建具', status: '進行中', delivery_date: null },
  { id: 2, project_code: 'P-2', name: '佐藤邸新築', customer_id: 2, customer_name: '佐藤工務店', status: '見積済', delivery_date: null },
];
const vouchers = [
  { id: 11, voucher_no: 'E00011', voucher_type: 'estimate', status: 'draft', project_id: null, customer_id: 1, customer_name: '山田建具', voucher_date: '2026-10-24', description: '玄関建具', total_amount: 110000 },
  { id: 12, voucher_no: 'S00012', voucher_type: 'sales', status: 'approved', project_id: null, customer_id: 2, customer_name: '佐藤工務店', voucher_date: '2026-10-23', description: '窓工事', total_amount: 220000 },
  { id: 13, voucher_no: 'E00013', voucher_type: 'estimate', status: 'draft', project_id: null, customer_id: null, customer_name: null, voucher_date: '2026-10-22', description: '得意先未設定', total_amount: 330000 },
];

let requests: Array<{ method: string; url: string; body?: Record<string, unknown> }>;

beforeEach(() => {
  localStorage.clear();
  requests = [];
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const url = new URL(rawUrl, 'http://localhost');
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    requests.push({ method, url: rawUrl, body });
    if (url.pathname.endsWith('/customers')) return new Response(JSON.stringify(customers));
    if (url.pathname.endsWith('/projects')) {
      const customerId = Number(url.searchParams.get('customer_id'));
      const data = customerId ? projects.filter(project => project.customer_id === customerId) : projects;
      return new Response(JSON.stringify({ data, meta: { total: data.length, page: 1, per_page: 50, last_page: 1 } }));
    }
    if (url.pathname.endsWith('/vouchers') && method === 'GET') {
      return new Response(JSON.stringify({ data: vouchers, meta: { total: vouchers.length, page: 1, per_page: 50, last_page: 1 } }));
    }
    if (/\/vouchers\/\d+$/.test(url.pathname) && method === 'PUT') {
      const voucher = vouchers.find(item => url.pathname.endsWith(`/${item.id}`));
      return new Response(JSON.stringify({ ...voucher, ...body }));
    }
    throw new Error(`未処理のリクエスト: ${method} ${rawUrl}`);
  }));
});

function LocationView() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}</output>;
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/projects?assign=1']}>
        <LocationView />
        <Routes><Route path="/projects" element={<ProjectList />} /></Routes>
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

describe('R-0198 未割り当て伝票による案件の得意先絞り込み', () => {
  it('カードをクリックすると案件取得とURLに伝票のcustomer_idが入り、得意先名を表示する', async () => {
    renderPage();
    fireEvent.click(await screen.findByTestId('unlinked-voucher-11'));

    await waitFor(() => expect(requests.some(request => {
      const url = new URL(request.url, 'http://localhost');
      return url.pathname.endsWith('/projects') && url.searchParams.get('customer_id') === '1';
    })).toBe(true));
    expect(screen.getByTestId('location').textContent).toContain('customer_id=1');
    expect(await screen.findByText('山田建具 の案件')).toBeTruthy();
  });

  it('選んだカードを見分けられる', async () => {
    renderPage();
    const card = await screen.findByTestId('unlinked-voucher-11');
    fireEvent.click(card);

    expect(card.getAttribute('aria-pressed')).toBe('true');
    expect(card.className).toContain('border-blue-500');
  });

  it('同じカードの再クリックで解除し、別カードのクリックで切り替える', async () => {
    renderPage();
    const first = await screen.findByTestId('unlinked-voucher-11');
    const second = await screen.findByTestId('unlinked-voucher-12');
    fireEvent.click(first);
    await waitFor(() => expect(screen.getByTestId('location').textContent).toContain('customer_id=1'));
    fireEvent.click(first);
    await waitFor(() => expect(screen.getByTestId('location').textContent).not.toContain('customer_id'));
    expect(first.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(second);
    await waitFor(() => expect(screen.getByTestId('location').textContent).toContain('customer_id=2'));
    expect(first.getAttribute('aria-pressed')).toBe('false');
    expect(second.getAttribute('aria-pressed')).toBe('true');
  });

  it('得意先未設定の伝票を選んでも絞り込まない', async () => {
    renderPage();
    const card = await screen.findByTestId('unlinked-voucher-13');
    fireEvent.click(card);

    expect(screen.getByTestId('location').textContent).toBe('/projects?assign=1');
    expect(card.getAttribute('aria-pressed')).toBe('true');
    expect(requests.filter(request => request.url.includes('/projects?'))).toHaveLength(1);
  });

  it('選んだ伝票を案件へ割り当てると選択と絞り込みが外れる', async () => {
    renderPage();
    const card = await screen.findByTestId('unlinked-voucher-11');
    fireEvent.click(card);
    const project = await screen.findByTestId('assign-project-1');
    const transfer = dataTransfer();
    fireEvent.dragStart(card, { dataTransfer: transfer });
    fireEvent.drop(project, { dataTransfer: transfer });

    await waitFor(() => expect(requests.some(request => request.method === 'PUT' && request.url.endsWith('/vouchers/11'))).toBe(true));
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/projects?assign=1'));
    expect(screen.queryByTestId('unlinked-voucher-11')).toBeNull();
  });
});
