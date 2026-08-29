import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ProjectDetail from '../ProjectDetail';

const baseProject = {
  id: 5,
  project_code: 'P-5',
  name: '既存案件',
  customer_id: 1,
  description: null,
  address: null,
  status: '進行中',
  start_date: '2026-01-01',
  end_date: null,
  delivery_date: null,
  memo: '元のメモ',
  order_date: null,
  owner_name: null,
  general_contractor_name: null,
  site_contact: null,
  created_at: '2026-01-01 00:00:00',
  updated_at: '2026-01-01 00:00:00',
};

let putBodies: any[] = [];
let currentProject: typeof baseProject & Record<string, unknown>;

function stubFetch() {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const u = new URL(url, 'http://localhost');
    const method = init?.method ?? 'GET';
    if (u.pathname.endsWith('/customers')) {
      return new Response(JSON.stringify([{ id: 1, name: '既存得意先', name_kana: null, memo: null }]), { status: 200 });
    }
    if (u.pathname.endsWith('/project-statuses')) {
      return new Response(JSON.stringify([{ id: 1, name: '進行中', sort_order: 4, is_active: 1, created_at: '2026-01-01 00:00:00' }]), { status: 200 });
    }
    if (method === 'PUT') {
      const body = JSON.parse(String(init?.body ?? '{}'));
      putBodies.push(body);
      return new Response(JSON.stringify({ ...currentProject, ...body }), { status: 200 });
    }
    return new Response(JSON.stringify(currentProject), { status: 200 });
  }));
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/projects/5']}>
        <Routes>
          <Route path="/projects/:id" element={<ProjectDetail />} />
          <Route path="/projects" element={<div>一覧画面</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ProjectDetail 工数目安 (R-0097)', () => {
  beforeEach(() => {
    putBodies = [];
  });

  it('見積伝票から集計工数がある場合は読み取り専用の自動計算表示になる', async () => {
    currentProject = { ...baseProject, estimated_factory_hours: 24, estimated_site_hours: 8, manual_estimated_hours: null, effective_estimated_hours: 32 };
    stubFetch();
    renderPage();
    await screen.findByDisplayValue('既存案件');

    expect(await screen.findByText(/見積伝票から自動計算: 32時間（4\.0日）/)).toBeTruthy();
    expect(screen.queryByLabelText('工数目安（h）')).toBeNull();
  });

  it('見積伝票が無い場合は工数目安を小数第1位まで手動入力できる', async () => {
    currentProject = { ...baseProject, estimated_factory_hours: 0, estimated_site_hours: 0, manual_estimated_hours: 4.5, effective_estimated_hours: 4.5 };
    stubFetch();
    const user = userEvent.setup();
    renderPage();
    await screen.findByDisplayValue('既存案件');

    const input = await screen.findByLabelText('工数目安（h）') as HTMLInputElement;
    expect(input.value).toBe('4.5');
    expect(input.step).toBe('0.1');
    expect(screen.getByText('0.6日')).toBeTruthy();

    await user.clear(input);
    await user.type(input, '6.5');
    expect(screen.getByText('0.8日')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => expect(putBodies.length).toBeGreaterThan(0));
    expect(putBodies[0].manual_estimated_hours).toBe(6.5);
  });
});
