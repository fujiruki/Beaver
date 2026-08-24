import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import AppLayout from '../AppLayout';

vi.mock('react-router-dom', () => ({
  NavLink: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
  Outlet: () => <div />,
  useLocation: () => ({ pathname: '/' }),
}));

vi.mock('../../../contexts/AppSettingsContext', () => ({
  useAppSettings: () => ({ settings: { fontSize: 16 } }),
}));

vi.mock('../../feedback/FeedbackModal', () => ({
  default: () => <button>feedback</button>,
}));

function renderWithQueryClient() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AppLayout />
    </QueryClientProvider>,
  );
}

describe('R-0109: AppLayoutのログイン情報表示・ログアウト導線', () => {
  let originalLocation: Location;

  beforeEach(() => {
    originalLocation = window.location;
    // @ts-expect-error jsdomのlocationはテストのため置き換える
    delete window.location;
    // @ts-expect-error 上記の置き換えを補うテスト用スタブ
    window.location = { href: 'https://door-fujita.com/contents/Beaver/customers' } as Location;
  });

  afterEach(() => {
    // @ts-expect-error jsdomのlocationはテストのため復元する
    window.location = originalLocation;
  });

  it('ログイン中のユーザー名を表示する', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ id: 1, name: '藤田晴樹' }), { status: 200 }),
    ));

    renderWithQueryClient();

    expect(await screen.findByText('藤田晴樹')).toBeTruthy();
  });

  it('ログアウトボタンを押すとauth-hubのログアウト画面へ遷移する', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ id: 1, name: '藤田晴樹' }), { status: 200 }),
    ));

    renderWithQueryClient();
    await screen.findByText('藤田晴樹');

    fireEvent.click(screen.getByText('ログアウト'));

    await waitFor(() => expect(window.location.href).toBe(
      'https://door-fujita.com/contents/auth/logout?redirect=' + encodeURIComponent('https://door-fujita.com/contents/Beaver/customers'),
    ));
  });

  it('未ログイン(null)のときはユーザー名を表示しない', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response('null', { status: 200 }),
    ));

    renderWithQueryClient();

    await waitFor(() => expect(screen.queryByText('ログアウト')).toBeNull());
  });
});
