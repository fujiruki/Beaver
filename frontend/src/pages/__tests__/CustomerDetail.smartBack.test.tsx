import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import CustomerDetail from '../CustomerDetail';

const baseCustomer = {
  id: 1,
  code: 'C-1',
  name: '既存得意先',
  name_kana: null,
  honorific_type: '御中',
  cutoff_day: 31,
  billing_offset_days: 15,
  payment_due_days: 30,
  billing_date_print: 0,
  is_active: 1,
  carry_forward_balance: 0,
  memo: null,
};

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => {
    return new Response(JSON.stringify(baseCustomer), { status: 200 });
  }));
});

function CustomerListStub() {
  const location = useLocation();
  return <div>一覧画面: {location.search}</div>;
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter
        initialEntries={['/customers?sort=name&order=desc', '/customers/1']}
        initialIndex={1}
      >
        <Routes>
          <Route path="/customers/:id" element={<CustomerDetail />} />
          <Route path="/customers" element={<CustomerListStub />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('CustomerDetail 戻る (R-0096 Phase2)', () => {
  it('一覧のソート状態を保持したまま「← 戻る」で一覧に戻る', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: '← 戻る' }));

    expect(await screen.findByText('一覧画面: ?sort=name&order=desc')).toBeTruthy();
  });

  it('一覧のソート状態を保持したまま「キャンセル」で一覧に戻る', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'キャンセル' }));

    expect(await screen.findByText('一覧画面: ?sort=name&order=desc')).toBeTruthy();
  });

  it('一覧のソート状態を保持したまま保存成功後に一覧に戻る（R-0096 Phase2b）', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: '保存' }));

    expect(await screen.findByText('一覧画面: ?sort=name&order=desc')).toBeTruthy();
  });
});
