import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import TateguItemDetail from '../TateguItemDetail';

const baseItem = {
  id: 9,
  item_code: 'T-9',
  name: '既存建具',
  spec: null,
  base_catalog_item_name: null,
  cost_body: 1000,
  cost_hardware: 0,
  cost_glass: 0,
  cost_factory_hours: 0,
  cost_site_hours: 0,
  cost_labor_rate: 0,
  unit: null,
  memo: null,
  created_at: '2026-01-01 00:00:00',
  updated_at: '2026-01-01 00:00:00',
  cost_breakdown: [],
  cost_lines: [],
  labor_lines: [],
};

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const u = new URL(url, 'http://localhost');
    if (u.pathname.endsWith('/aggregation-categories')) {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    return new Response(JSON.stringify(baseItem), { status: 200 });
  }));
});

function TateguListStub() {
  const location = useLocation();
  return <div>一覧画面: {location.search}</div>;
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter
        initialEntries={['/tategu?sort=name&order=desc', '/tategu/9']}
        initialIndex={1}
      >
        <Routes>
          <Route path="/tategu/:id" element={<TateguItemDetail />} />
          <Route path="/tategu" element={<TateguListStub />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('TateguItemDetail 戻る (R-0096 Phase2b)', () => {
  it('一覧のソート状態を保持したまま保存成功後に一覧に戻る', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: '保存' }));

    expect(await screen.findByText('一覧画面: ?sort=name&order=desc')).toBeTruthy();
  });
});
