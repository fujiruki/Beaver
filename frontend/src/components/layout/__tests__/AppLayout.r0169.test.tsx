import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import AppLayout from '../AppLayout';

const { mockLocation } = vi.hoisted(() => ({ mockLocation: { pathname: '/', search: '' } }));

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

function renderAt(pathname: string, search = '') {
  mockLocation.pathname = pathname;
  mockLocation.search = search;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AppLayout />
    </QueryClientProvider>,
  );
}

function linksIn(el: Element, label: string): HTMLAnchorElement[] {
  return Array.from(el.querySelectorAll('a')).filter(a => a.textContent?.trim().endsWith(label));
}

const header = () => document.querySelector('header') as HTMLElement;
const sidebar = () => Array.from(document.querySelectorAll('nav')).find(n => n.className.includes('fixed')) as HTMLElement;

describe('R-0169: 上部メニューの「伝票」を「見積」「売上」に分ける', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('null', { status: 200 })));
  });

  it('PCヘッダーとサイドバーに「見積」「売上」があり「伝票」は無い', () => {
    renderAt('/');
    for (const el of [header(), sidebar()]) {
      expect(linksIn(el, '見積')[0]?.getAttribute('href')).toBe('/vouchers?voucher_type=estimate');
      expect(linksIn(el, '売上')[0]?.getAttribute('href')).toBe('/vouchers?voucher_type=sales');
      expect(linksIn(el, '伝票')).toHaveLength(0);
    }
  });

  it('種別が売上の一覧では「売上」だけが選択中になる', () => {
    renderAt('/vouchers', '?voucher_type=sales');
    for (const el of [header(), sidebar()]) {
      expect(linksIn(el, '売上')[0].style.background).toBe('#334155');
      expect(['', 'transparent']).toContain(linksIn(el, '見積')[0].style.background);
    }
  });

  it('種別が見積の一覧では「見積」だけが選択中になる', () => {
    renderAt('/vouchers', '?voucher_type=estimate');
    expect(linksIn(header(), '見積')[0].style.background).toBe('#334155');
    expect(linksIn(header(), '売上')[0].style.background).toBe('');
  });

  it('種別が分からない伝票画面ではどちらも選択中にしない', () => {
    renderAt('/vouchers/5');
    for (const el of [header(), sidebar()]) {
      expect(['', 'transparent']).toContain(linksIn(el, '見積')[0].style.background);
      expect(['', 'transparent']).toContain(linksIn(el, '売上')[0].style.background);
    }
  });
});
