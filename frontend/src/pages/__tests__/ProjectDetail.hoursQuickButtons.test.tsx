import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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

describe('ProjectDetail 工数目安クイックボタン (R-0102)', () => {
  it('4hボタンで工数目安に4がセットされる', async () => {
    currentProject = { ...baseProject, estimated_factory_hours: 0, estimated_site_hours: 0, manual_estimated_hours: 1, effective_estimated_hours: 1 };
    stubFetch();
    const user = userEvent.setup();
    renderPage();
    await screen.findByDisplayValue('既存案件');

    const input = await screen.findByLabelText('工数目安（h）') as HTMLInputElement;
    await user.click(screen.getByRole('button', { name: '4h' }));

    expect(input.value).toBe('4');
  });

  it.each([
    ['1日', 1],
    ['2日', 2],
    ['3日', 3],
    ['5日', 5],
    ['8日', 8],
    ['14日', 14],
  ])('%sボタンでhoursPerDay（既定8）×N日の値がセットされる', async (label, days) => {
    currentProject = { ...baseProject, estimated_factory_hours: 0, estimated_site_hours: 0, manual_estimated_hours: 1, effective_estimated_hours: 1 };
    stubFetch();
    const user = userEvent.setup();
    renderPage();
    await screen.findByDisplayValue('既存案件');

    const input = await screen.findByLabelText('工数目安（h）') as HTMLInputElement;
    await user.click(screen.getByRole('button', { name: label }));

    expect(input.value).toBe(String(days * 8));
  });

  it('見積伝票から自動計算されている場合（読み取り専用表示）はクイックボタンを表示しない', async () => {
    currentProject = { ...baseProject, estimated_factory_hours: 24, estimated_site_hours: 8, manual_estimated_hours: null, effective_estimated_hours: 32 };
    stubFetch();
    renderPage();
    await screen.findByDisplayValue('既存案件');

    expect(await screen.findByText(/見積伝票から自動計算/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: '4h' })).toBeNull();
    expect(screen.queryByRole('button', { name: '1日' })).toBeNull();
  });

  it('クイックボタンはtype=buttonでフォーム送信を誘発しない', async () => {
    currentProject = { ...baseProject, estimated_factory_hours: 0, estimated_site_hours: 0, manual_estimated_hours: 1, effective_estimated_hours: 1 };
    stubFetch();
    renderPage();
    await screen.findByDisplayValue('既存案件');

    const button = await screen.findByRole('button', { name: '4h' });
    expect(button.getAttribute('type')).toBe('button');
  });
});
