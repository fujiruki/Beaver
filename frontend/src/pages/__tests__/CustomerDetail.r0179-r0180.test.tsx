import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import CustomerDetail from '../CustomerDetail';
import NewCustomerModal from '../../components/NewCustomerModal';

const candidate = {
  id: 12, code: '0012', name: '山田工務店', name_kana: 'ヤマダコウムテン',
  tel: '06-1234-5678', mobile: null, address1: '大阪府大阪市', is_active: 1,
  access_customer_no: '12', matched: ['name'],
};

function createClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

function renderPage(fetchImpl: typeof fetch, initialEntry = '/customers/new') {
  vi.stubGlobal('fetch', vi.fn(fetchImpl));
  const router = createMemoryRouter([
    { path: '/customers/new', element: <CustomerDetail /> },
    { path: '/customers/:id', element: <div>既存得意先詳細</div> },
    { path: '/customers', element: <div>得意先一覧</div> },
    { path: '/projects', element: <div>案件一覧</div> },
  ], { initialEntries: [initialEntry] });
  render(<QueryClientProvider client={createClient()}><RouterProvider router={router} /></QueryClientProvider>);
  return router;
}

describe('R-0179 似た得意先の案内', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('候補件数を入力欄の近くに表示し、押すと一覧へスクロールする。0件なら消える', async () => {
    let hasCandidate = true;
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('/customers/similar')) {
        return new Response(JSON.stringify(hasCandidate ? [candidate] : []));
      }
      return new Response('{}');
    }));
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const user = userEvent.setup();
    const router = createMemoryRouter([{ path: '/customers/new', element: <CustomerDetail /> }], { initialEntries: ['/customers/new'] });
    const { container } = render(<QueryClientProvider client={createClient()}><RouterProvider router={router} /></QueryClientProvider>);

    const name = container.querySelector('[name="name"]')!;
    await user.type(name, '山田工務店');
    const hint = await screen.findByRole('button', { name: '似た得意先が1件あります（画面下を確認）' });
    await user.click(hint);
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth' });

    hasCandidate = false;
    await user.clear(name);
    await user.type(name, '別の得意先');
    await waitFor(() => expect(screen.queryByRole('button', { name: /似た得意先が/ })).toBeNull());
  });

  it('新規得意先モーダルでも案内を表示し、案内と一覧で候補APIを1回だけ呼ぶ', async () => {
    let similarCalls = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      if (String(input).includes('/customers/similar')) {
        similarCalls += 1;
        return new Response(JSON.stringify([candidate]));
      }
      return new Response('{}');
    }));
    const user = userEvent.setup();
    const { container } = render(
      <QueryClientProvider client={createClient()}>
        <NewCustomerModal isOpen onClose={vi.fn()} onCreated={vi.fn()} />
      </QueryClientProvider>,
    );
    await user.type(container.querySelector('[name="name"]')!, '山田工務店');
    expect(await screen.findByRole('button', { name: '似た得意先が1件あります（画面下を確認）' })).toBeTruthy();
    expect(screen.getByText('似た得意先があります。同じ得意先ならそちらを使ってください')).toBeTruthy();
    expect(similarCalls).toBe(1);
  });
});

describe('R-0180 得意先画面の離脱ガード', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('入力すると未保存表示とbeforeunload確認が有効になり、保存成功後は解除される', async () => {
    const fetchImpl = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      if ((init?.method ?? 'GET') === 'POST') return new Response(JSON.stringify({ ...candidate, id: 20 }), { status: 201 });
      return new Response(JSON.stringify([]));
    });
    const router = renderPage(fetchImpl as typeof fetch);
    const user = userEvent.setup();
    const name = document.querySelector('[name="name"]')!;
    await user.type(name, '新規得意先');
    expect(screen.getByText('未保存の変更があります')).toBeTruthy();

    const dirtyEvent = new Event('beforeunload', { cancelable: true });
    const preventDefault = vi.spyOn(dirtyEvent, 'preventDefault');
    window.dispatchEvent(dirtyEvent);
    expect(preventDefault).toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(await screen.findByText('得意先一覧')).toBeTruthy();
    expect(router.state.location.pathname).toBe('/customers');
    const savedEvent = new Event('beforeunload', { cancelable: true });
    const savedPreventDefault = vi.spyOn(savedEvent, 'preventDefault');
    window.dispatchEvent(savedEvent);
    expect(savedPreventDefault).not.toHaveBeenCalled();
  });

  it('未保存での画面内遷移は確認し、キャンセルなら残りOKなら移る', async () => {
    renderPage(async () => new Response(JSON.stringify([])));
    const user = userEvent.setup();
    await user.type(document.querySelector('[name="name"]')!, '入力中');
    const confirm = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    vi.stubGlobal('confirm', confirm);

    await user.click(screen.getByRole('button', { name: '← 戻る' }));
    await waitFor(() => expect(confirm).toHaveBeenCalledWith('保存していない入力があります。このページを離れますか？'));
    expect(screen.queryByText('得意先一覧')).toBeNull();
    await user.click(screen.getByRole('button', { name: '← 戻る' }));
    expect(await screen.findByText('得意先一覧')).toBeTruthy();
  });

  it('候補を選んで移るときは確認しない', async () => {
    renderPage(async (input) => new Response(JSON.stringify(String(input).includes('/customers/similar') ? [candidate] : candidate)));
    const user = userEvent.setup();
    const confirm = vi.fn().mockReturnValue(true);
    vi.stubGlobal('confirm', confirm);
    await user.type(document.querySelector('[name="name"]')!, '山田工務店');
    await user.click(await screen.findByRole('button', { name: /0012.*山田工務店/ }));
    expect(await screen.findByText('既存得意先詳細')).toBeTruthy();
    expect(confirm).not.toHaveBeenCalled();
  });

  it('未保存でなければbeforeunload確認を出さない', () => {
    renderPage(async () => new Response(JSON.stringify([])));
    const event = new Event('beforeunload', { cancelable: true });
    const preventDefault = vi.spyOn(event, 'preventDefault');
    window.dispatchEvent(event);
    expect(preventDefault).not.toHaveBeenCalled();
  });
});
