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
let postBodies: any[] = [];
let currentProject: typeof baseProject;

beforeEach(() => {
  putBodies = [];
  postBodies = [];
  currentProject = { ...baseProject };
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
    if (method === 'POST' && u.pathname.endsWith('/projects')) {
      const body = JSON.parse(String(init?.body ?? '{}'));
      postBodies.push(body);
      return new Response(JSON.stringify({ ...currentProject, ...body, id: 42 }), { status: 201 });
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

function renderNewPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/projects/new']}>
        <Routes>
          <Route path="/projects/new" element={<ProjectDetail />} />
          <Route path="/projects/:id" element={<div>作成案件画面</div>} />
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

    await user.tab();
    await waitFor(() => expect(putBodies.length).toBeGreaterThan(0));
    expect(putBodies[0].memo).toBe('編集後のメモ');
  });

  it('案件名を編集して保存すると、編集後の値がPUTで送信される', async () => {
    const user = userEvent.setup();
    renderPage();

    const name = await screen.findByDisplayValue('既存案件') as HTMLInputElement;
    await user.clear(name);
    await user.type(name, '新しい案件名');

    await user.tab();
    await waitFor(() => expect(putBodies.length).toBeGreaterThan(0));
    expect(putBodies[0].name).toBe('新しい案件名');
  });
});

describe('ProjectDetail 新規保存後の遷移 (R-0217)', () => {
  it('作成された案件IDの編集画面を開く', async () => {
    const user = userEvent.setup();
    const { container } = renderNewPage();

    const name = container.querySelector('input[name="name"]') as HTMLInputElement;
    await user.type(name, '新規案件');
    const customer = screen.getByPlaceholderText('得意先を検索...');
    await user.click(customer);
    await user.keyboard('{Enter}');
    await user.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => expect(postBodies).toHaveLength(1));
    expect(await screen.findByText('作成案件画面')).toBeTruthy();
    expect(screen.queryByText('一覧画面')).toBeNull();
  });
});
