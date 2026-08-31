import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import AppLayout from '../AppLayout';

vi.mock('react-router-dom', () => ({
  NavLink: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <a onClick={onClick}>{children}</a>
  ),
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

describe('R-0129: AppLayoutのスマホ向けハンバーガーメニュー', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('null', { status: 200 })));
  });

  it('初期状態ではサイドバーが閉じている（aria-expanded=false）', () => {
    renderWithQueryClient();
    expect(screen.getByRole('button', { name: 'メニューを開閉' }).getAttribute('aria-expanded')).toBe('false');
  });

  it('ハンバーガーボタンをクリックするとサイドバーが開く', () => {
    renderWithQueryClient();
    fireEvent.click(screen.getByRole('button', { name: 'メニューを開閉' }));
    expect(screen.getByRole('button', { name: 'メニューを開閉' }).getAttribute('aria-expanded')).toBe('true');
  });

  it('もう一度クリックすると閉じる', () => {
    renderWithQueryClient();
    const button = screen.getByRole('button', { name: 'メニューを開閉' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('ナビ項目クリックでサイドバーが閉じる', () => {
    renderWithQueryClient();
    const button = screen.getByRole('button', { name: 'メニューを開閉' });
    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');

    fireEvent.click(screen.getByText('案件'));

    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('開いた状態でオーバーレイをクリックすると閉じる', () => {
    renderWithQueryClient();
    const button = screen.getByRole('button', { name: 'メニューを開閉' });
    fireEvent.click(button);

    fireEvent.click(screen.getByTestId('sidebar-overlay'));

    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('閉じた状態ではオーバーレイが存在しない', () => {
    renderWithQueryClient();
    expect(screen.queryByTestId('sidebar-overlay')).toBeNull();
  });
});
