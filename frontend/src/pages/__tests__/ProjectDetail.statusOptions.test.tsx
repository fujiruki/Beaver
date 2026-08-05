import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ProjectDetail from '../ProjectDetail';

// R-0085: 案件ステータス選択欄はハードコードされた7択ではなく、
// /project-statuses から取得した is_active=1 の一覧を sort_order 順に表示すること。
const project = {
  id: 5,
  project_code: 'P-5',
  name: '既存案件',
  customer_id: 1,
  description: null,
  address: null,
  status: '進行中',
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
// ここではその前提を模して、意図的に工程順とは異なる並びをそのまま返し、
// フロントエンドが並べ替えず取得順をそのまま選択肢にすることを検証する。
const ACTIVE_STATUSES = [
  { id: 3, name: '受注済', sort_order: 3, is_active: 1, created_at: '2026-01-01 00:00:00' },
  { id: 9, name: '追加ステータス', sort_order: 9, is_active: 1, created_at: '2026-01-01 00:00:00' },
];

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const u = new URL(url, 'http://localhost');
    if (u.pathname.endsWith('/customers')) {
      return new Response(JSON.stringify([{ id: 1, name: '既存得意先', name_kana: null, memo: null }]), { status: 200 });
    }
    if (u.pathname.endsWith('/project-statuses')) {
      return new Response(JSON.stringify(ACTIVE_STATUSES), { status: 200 });
    }
    return new Response(JSON.stringify(project), { status: 200 });
  }));
});

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/projects/5']}>
        <Routes>
          <Route path="/projects/:id" element={<ProjectDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ProjectDetail ステータス選択肢 (R-0085)', () => {
  it('/project-statuses から取得した一覧が選択肢に反映される', async () => {
    renderPage();
    expect(await screen.findByRole('option', { name: '受注済' })).not.toBeNull();
    expect(await screen.findByRole('option', { name: '追加ステータス' })).not.toBeNull();
  });

  it('固定7択ハードコードの選択肢（例:「見積済」)はAPI応答に無ければ表示されない', async () => {
    renderPage();
    await screen.findByRole('option', { name: '受注済' });
    expect(screen.queryByRole('option', { name: '見積済' })).toBeNull();
  });
});
