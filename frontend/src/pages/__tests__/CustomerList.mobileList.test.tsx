import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import CustomerList from '../CustomerList';

const ALL_CUSTOMERS = [
  { id: 1, code: 'C-1', name: '田中商店', tel: '03-1234-5678', address1: '東京都千代田区1-1-1', address2: null },
  { id: 2, code: 'C-2', name: '鈴木製作所', tel: null, address1: null, address2: null },
];

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
    data: ALL_CUSTOMERS,
    meta: { total: ALL_CUSTOMERS.length, page: 1, per_page: 50, last_page: 1 },
  }), { status: 200 })));
});

function CustomerDetailStub() {
  const location = useLocation();
  return <div>詳細画面: {location.pathname}</div>;
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/customers']}>
        <Routes>
          <Route path="/customers" element={<CustomerList />} />
          <Route path="/customers/:id" element={<CustomerDetailStub />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('R-0129: CustomerList スマホ簡素リスト', () => {
  it('簡素リストがmd:hiddenクラス、DataTableラッパーがhidden md:blockクラスを持つ', async () => {
    renderPage();
    const mobileList = await screen.findByTestId('customer-mobile-list');
    const desktopTable = screen.getByTestId('customer-desktop-table');
    expect(mobileList.className).toContain('md:hidden');
    expect(desktopTable.className).toContain('hidden');
    expect(desktopTable.className).toContain('md:block');
  });

  it('簡素リスト行をクリックすると得意先詳細へ遷移する', async () => {
    renderPage();
    const mobileList = await screen.findByTestId('customer-mobile-list');
    const row = await within(mobileList).findByText('田中商店');

    fireEvent.click(row);

    await waitFor(() => expect(screen.getByText('詳細画面: /customers/1')).toBeTruthy());
  });

  it('電話番号リンクをクリックしても詳細へ遷移しない', async () => {
    renderPage();
    const mobileList = await screen.findByTestId('customer-mobile-list');
    const telLink = await within(mobileList).findByText('03-1234-5678');

    fireEvent.click(telLink);

    expect(telLink.closest('a')?.getAttribute('href')).toBe('tel:03-1234-5678');
    expect(screen.queryByText('詳細画面: /customers/1')).toBeNull();
  });

  it('電話番号が未登録の得意先ではtelリンクを表示しない', async () => {
    renderPage();
    const mobileList = await screen.findByTestId('customer-mobile-list');
    await within(mobileList).findByText('鈴木製作所');

    const row = within(mobileList).getByText('鈴木製作所').closest('div[data-testid="customer-mobile-row"]') as HTMLElement;
    expect(within(row).queryByRole('link')).toBeNull();
  });
});
