import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import CarryForwardEdit from '../CarryForwardEdit';

const baseCustomer = {
  id: 7,
  code: 'C-7',
  name: '既存得意先',
  name_kana: null,
  honorific_type: '御中',
  cutoff_day: 31,
  billing_offset_days: 15,
  payment_due_days: 30,
  billing_date_print: 0,
  is_active: 1,
  carry_forward_balance: 1000,
  memo: null,
};

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => {
    return new Response(JSON.stringify(baseCustomer), { status: 200 });
  }));
});

function CustomerDetailStub() {
  const location = useLocation();
  return <div>得意先詳細画面: {location.search}</div>;
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter
        initialEntries={['/customers/7?tab=history', '/customers/7/carry-forward']}
        initialIndex={1}
      >
        <Routes>
          <Route path="/customers/:id/carry-forward" element={<CarryForwardEdit />} />
          <Route path="/customers/:id" element={<CustomerDetailStub />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('CarryForwardEdit 戻る (R-0096 Phase2b)', () => {
  it('得意先詳細のURL状態を保持したまま保存成功後に戻る', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(await screen.findByPlaceholderText('1000'), '2000');
    await user.click(screen.getByRole('checkbox'));
    await user.click(await screen.findByRole('button', { name: '修正を保存' }));

    expect(await screen.findByText('得意先詳細画面: ?tab=history')).toBeTruthy();
  });
});
