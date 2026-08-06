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
  estimated_factory_hours: 0,
  estimated_site_hours: 0,
  manual_estimated_hours: null,
  effective_estimated_hours: null,
  created_at: '2026-01-01 00:00:00',
  updated_at: '2026-01-01 00:00:00',
};

let deleteCalls: string[] = [];
let hardDeleteStatus = 200;
let hardDeleteBody: unknown = { deleted: true };

beforeEach(() => {
  deleteCalls = [];
  hardDeleteStatus = 200;
  hardDeleteBody = { deleted: true };
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const u = new URL(url, 'http://localhost');
    const method = init?.method ?? 'GET';
    if (u.pathname.endsWith('/customers')) {
      return new Response(JSON.stringify([{ id: 1, name: '既存得意先', name_kana: null, memo: null }]), { status: 200 });
    }
    if (u.pathname.endsWith('/project-statuses')) {
      return new Response(JSON.stringify([{ id: 1, name: '進行中', sort_order: 4, is_active: 1, created_at: '2026-01-01 00:00:00' }]), { status: 200 });
    }
    if (method === 'DELETE') {
      deleteCalls.push(u.pathname + u.search);
      return new Response(JSON.stringify(hardDeleteBody), { status: hardDeleteStatus });
    }
    return new Response(JSON.stringify(baseProject), { status: 200 });
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

describe('ProjectDetail 完全削除 (R-0095)', () => {
  it('新規登録時は完全削除ボタンが表示されない', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/projects/new']}>
          <Routes>
            <Route path="/projects/new" element={<ProjectDetail />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await screen.findByText('案件 新規登録');
    expect(screen.queryByRole('button', { name: '完全削除' })).toBeNull();
  });

  it('編集画面に完全削除ボタンが表示され、クリックで警告モーダルが開く', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByDisplayValue('既存案件');

    const deleteBtn = screen.getByRole('button', { name: '完全削除' });
    await user.click(deleteBtn);

    expect(await screen.findByText(/この操作は取り消せません/)).toBeTruthy();
  });

  it('モーダルの「完全に削除する」をクリックするとDELETE /projects/5?hard=1が呼ばれ、成功後に一覧へ遷移する', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByDisplayValue('既存案件');

    await user.click(screen.getByRole('button', { name: '完全削除' }));
    await screen.findByText(/この操作は取り消せません/);
    await user.click(screen.getByRole('button', { name: '完全に削除する' }));

    await waitFor(() => expect(deleteCalls.length).toBeGreaterThan(0));
    expect(deleteCalls[0]).toContain('/projects/5');
    expect(deleteCalls[0]).toContain('hard=1');
    await screen.findByText('一覧画面');
  });

  it('請求書紐づきで409が返るとエラーメッセージがモーダルに表示され、一覧へは遷移しない', async () => {
    const user = userEvent.setup();
    hardDeleteStatus = 409;
    hardDeleteBody = { error: '請求書に紐づく伝票があるため完全削除できません' };
    renderPage();
    await screen.findByDisplayValue('既存案件');

    await user.click(screen.getByRole('button', { name: '完全削除' }));
    await screen.findByText(/この操作は取り消せません/);
    await user.click(screen.getByRole('button', { name: '完全に削除する' }));

    await screen.findByText('請求書に紐づく伝票があるため完全削除できません');
    expect(screen.queryByText('一覧画面')).toBeNull();
  });
});
