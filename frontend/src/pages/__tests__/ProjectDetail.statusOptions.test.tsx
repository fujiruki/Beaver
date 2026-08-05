import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ProjectDetail from '../ProjectDetail';

// R-0089: 案件ステータス選択欄は<select>ではなく、
// /project-statuses から取得した is_active=1 の一覧を sort_order 順に並べた
// ステッパーUI（円ボタン＋線）で表示・操作すること。
const project = {
  id: 5,
  project_code: 'P-5',
  name: '既存案件',
  customer_id: 1,
  description: null,
  address: null,
  status: '受注済',
  start_date: null,
  end_date: null,
  delivery_date: null,
  memo: null,
  order_date: null,
  owner_name: null,
  general_contractor_name: null,
  site_contact: null,
  created_at: '2026-01-01 00:00:00',
  updated_at: '2026-01-01 00:00:00',
};

// サーバ側は is_active=1 のみ・sort_order順で返す前提（project_statuses.php の GET 実装通り）。
const ACTIVE_STATUSES = [
  { id: 3, name: '受注済', sort_order: 3, is_active: 1, created_at: '2026-01-01 00:00:00' },
  { id: 9, name: '追加ステータス', sort_order: 9, is_active: 1, created_at: '2026-01-01 00:00:00' },
];

let putBodies: any[] = [];

beforeEach(() => {
  putBodies = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const u = new URL(url, 'http://localhost');
    const method = init?.method ?? 'GET';
    if (u.pathname.endsWith('/customers')) {
      return new Response(JSON.stringify([{ id: 1, name: '既存得意先', name_kana: null, memo: null }]), { status: 200 });
    }
    if (u.pathname.endsWith('/project-statuses')) {
      return new Response(JSON.stringify(ACTIVE_STATUSES), { status: 200 });
    }
    if (method === 'PUT') {
      const body = JSON.parse(String(init?.body ?? '{}'));
      putBodies.push(body);
      return new Response(JSON.stringify({ ...project, ...body }), { status: 200 });
    }
    return new Response(JSON.stringify(project), { status: 200 });
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

describe('ProjectDetail ステータスステッパー (R-0089)', () => {
  it('/project-statuses から取得した一覧が円ボタンとして表示される', async () => {
    renderPage();
    expect(await screen.findByRole('button', { name: '受注済' })).not.toBeNull();
    expect(await screen.findByRole('button', { name: '追加ステータス' })).not.toBeNull();
  });

  it('固定7択ハードコードの選択肢（例:「見積済」)はAPI応答に無ければ表示されない', async () => {
    renderPage();
    await screen.findByRole('button', { name: '受注済' });
    expect(screen.queryByRole('button', { name: '見積済' })).toBeNull();
  });

  it('現在のステータスの円は aria-pressed=true、それ以外は false', async () => {
    renderPage();
    const current = await screen.findByRole('button', { name: '受注済' });
    const other = await screen.findByRole('button', { name: '追加ステータス' });
    expect(current.getAttribute('aria-pressed')).toBe('true');
    expect(other.getAttribute('aria-pressed')).toBe('false');
  });

  it('円をクリックするとそのステータスに切り替わり、保存時にPUTへ反映される', async () => {
    const user = userEvent.setup();
    renderPage();

    const other = await screen.findByRole('button', { name: '追加ステータス' });
    await user.click(other);
    expect(other.getAttribute('aria-pressed')).toBe('true');

    await user.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(putBodies.length).toBeGreaterThan(0));
    expect(putBodies[0].status).toBe('追加ステータス');
  });
});
