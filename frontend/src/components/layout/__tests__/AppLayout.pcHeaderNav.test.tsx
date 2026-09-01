import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import AppLayout from '../AppLayout';

const { mockLocation } = vi.hoisted(() => ({ mockLocation: { pathname: '/' } }));

vi.mock('react-router-dom', () => ({
  NavLink: ({ children, to, style, className }: { children: React.ReactNode; to: string; style?: unknown; className?: string }) => (
    <a href={to} className={className} style={typeof style === 'function' ? (style as (p: { isActive: boolean }) => object)({ isActive: false }) : (style as object)}>
      {children}
    </a>
  ),
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

function getSidebarNav(): HTMLElement {
  const navs = Array.from(document.querySelectorAll('nav'));
  const sidebar = navs.find((nav) => nav.className.includes('fixed'));
  if (!sidebar) throw new Error('サイドバーnavが見つかりません');
  return sidebar as HTMLElement;
}

describe('R-0139: PCヘッダーのタブナビゲーション', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('null', { status: 200 })));
  });

  it('PCヘッダー内にアイコン付きのナビタブが表示される', () => {
    renderAt('/');
    const header = document.querySelector('header');
    expect(header).toBeTruthy();
    expect(header?.className).toContain('hidden');
    expect(header?.className).toContain('md:flex');
    expect(header?.textContent).toContain('📁');
    expect(header?.textContent).toContain('案件');
  });

  it('現在のパスに対応するタブがハイライトされる', () => {
    renderAt('/projects');
    const header = document.querySelector('header') as HTMLElement;
    const links = Array.from(header.querySelectorAll('a'));
    const activeLink = links.find((a) => a.textContent?.includes('案件'));
    const otherLink = links.find((a) => a.textContent?.includes('得意先'));

    expect(activeLink?.style.background).toBe('#334155');
    expect(otherLink?.style.background).toBe('transparent');
  });

  it('サイドバー（モバイル用nav）にmd:hiddenが付与されている', () => {
    renderAt('/');
    const sidebar = getSidebarNav();
    expect(sidebar.className).toContain('md:hidden');
  });
});
