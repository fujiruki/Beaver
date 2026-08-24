import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import AppLayout from '../AppLayout';

const { mockLocation } = vi.hoisted(() => ({ mockLocation: { pathname: '/' } }));

vi.mock('react-router-dom', () => ({
  NavLink: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
  Outlet: () => <div />,
  useLocation: () => mockLocation,
}));

vi.mock('../../../contexts/AppSettingsContext', () => ({
  useAppSettings: () => ({ settings: { fontSize: 16 } }),
}));

vi.mock('../../feedback/FeedbackModal', () => ({
  default: () => <button>feedback</button>,
}));

function renderAt(pathname: string) {
  mockLocation.pathname = pathname;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AppLayout />
    </QueryClientProvider>,
  );
}

describe('R-0112: ブラウザタブ名', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('null', { status: 200 })));
  });

  it('案件画面では「案件 - Beaver」になる', () => {
    renderAt('/projects');
    expect(document.title).toBe('案件 - Beaver');
  });

  it('ダッシュボード（トップ）では「ダッシュボード - Beaver」になる', () => {
    renderAt('/');
    expect(document.title).toBe('ダッシュボード - Beaver');
  });

  it('該当ナビ項目がない未知のパスでは「Beaver」固定になる', () => {
    renderAt('/unknown-path');
    expect(document.title).toBe('Beaver');
  });
});
