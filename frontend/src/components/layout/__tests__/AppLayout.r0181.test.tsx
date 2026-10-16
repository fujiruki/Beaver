import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AppLayout from '../AppLayout';
import { AUTH_REQUIRED_EVENT, AUTH_RESTORED_EVENT } from '../../../api/client';

vi.mock('react-router-dom', () => ({
  NavLink: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
  Outlet: () => <div />,
  useLocation: () => ({ pathname: '/customers/new', search: '' }),
}));
vi.mock('../../../contexts/AppSettingsContext', () => ({ useAppSettings: () => ({ settings: { fontSize: 16 } }) }));
vi.mock('../../feedback/FeedbackModal', () => ({ default: () => null }));
vi.mock('../../../api/me', () => ({ useMe: () => ({ data: null }) }));

describe('R-0181: 全画面共通の再ログイン案内', () => {
  beforeEach(() => vi.stubGlobal('open', vi.fn()));

  it('案内を表示し、再ログインを別タブで開き、成功通知で消す', () => {
    render(<QueryClientProvider client={new QueryClient()}><AppLayout /></QueryClientProvider>);
    fireEvent(window, new CustomEvent(AUTH_REQUIRED_EVENT, { detail: { loginUrl: 'https://example.test/login' } }));

    expect(screen.getByText('ログインが切れました。ログインし直してください')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'ログインし直す' }));
    expect(window.open).toHaveBeenCalledWith('https://example.test/login', '_blank');

    fireEvent(window, new Event(AUTH_RESTORED_EVENT));
    expect(screen.queryByText('ログインが切れました。ログインし直してください')).toBeNull();
  });
});
