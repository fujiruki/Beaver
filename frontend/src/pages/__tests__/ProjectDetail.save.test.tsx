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
let currentProject: typeof baseProject;

beforeEach(() => {
  putBodies = [];
  currentProject = { ...baseProject };
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const u = new URL(url, 'http://localhost');
    const method = init?.method ?? 'GET';
    if (u.pathname.endsWith('/customers')) {
      return new Response(JSON.stringify([{ id: 1, name: '既存得意先', name_kana: null, memo: null }]), { status: 200 });
    }
    if (method === 'PUT') {
      const body = JSON.parse(String(init?.body ?? '{}'));
      putBodies.push(body);
      return new Response(JSON.stringify({ ...currentProject, ...body }), { status: 200 });
    }
    return new Response(JSON.stringify(currentProject), { status: 200 });
  }));
});

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

describe('ProjectDetail 保存 (R-071)', () => {
  it('備考を編集して保存すると、編集後の値がPUTで送信される', async () => {
    const user = userEvent.setup();
    renderPage();

    const memo = await screen.findByDisplayValue('元のメモ') as HTMLTextAreaElement;
    await user.clear(memo);
    await user.type(memo, '編集後のメモ');

    await user.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(putBodies.length).toBeGreaterThan(0));
    expect(putBodies[0].memo).toBe('編集後のメモ');
  });

  it('案件名を編集して保存すると、編集後の値がPUTで送信される', async () => {
    const user = userEvent.setup();
    renderPage();

    const name = await screen.findByDisplayValue('既存案件') as HTMLInputElement;
    await user.clear(name);
    await user.type(name, '新しい案件名');

    await user.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(putBodies.length).toBeGreaterThan(0));
    expect(putBodies[0].name).toBe('新しい案件名');
  });
});
