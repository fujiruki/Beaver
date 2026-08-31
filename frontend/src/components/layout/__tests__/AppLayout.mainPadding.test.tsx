import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
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

describe('R-0131: mainのpadding-topがTailwindクラスに委譲されている', () => {
  it('mainのインラインstyleにpaddingTopが含まれない', () => {
    const { container } = renderWithQueryClient();
    const main = container.querySelector('main') as HTMLElement;
    expect(main.style.paddingTop).toBe('');
  });

  it('mainのclassNameにpt-14とmd:pt-6が含まれる', () => {
    const { container } = renderWithQueryClient();
    const main = container.querySelector('main') as HTMLElement;
    expect(main.className).toContain('pt-14');
    expect(main.className).toContain('md:pt-6');
  });
});
