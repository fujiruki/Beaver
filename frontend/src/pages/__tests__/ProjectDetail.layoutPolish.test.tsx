import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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

describe('ProjectDetail レイアウト改善 (R-0101)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('ラベルが「工数目安（h）」になっている', async () => {
    currentProject = { ...baseProject, estimated_factory_hours: 0, estimated_site_hours: 0, manual_estimated_hours: 4.5, effective_estimated_hours: 4.5 };
    stubFetch();
    renderPage();
    await screen.findByDisplayValue('既存案件');

    expect(screen.getByText('工数目安（h）')).toBeTruthy();
    expect(screen.queryByText('工数目安')).toBeNull();
  });

  it('工数目安欄が「納期」の直後・「施主」の直前に表示される', async () => {
    currentProject = { ...baseProject, estimated_factory_hours: 0, estimated_site_hours: 0, manual_estimated_hours: 4.5, effective_estimated_hours: 4.5 };
    stubFetch();
    const { container } = renderPage();
    await screen.findByDisplayValue('既存案件');

    const labels = Array.from(container.querySelectorAll('label')).map(el => el.textContent);
    const deliveryIdx = labels.indexOf('納期');
    const hoursIdx = labels.indexOf('工数目安（h）');
    const ownerIdx = labels.indexOf('施主');

    expect(deliveryIdx).toBeGreaterThan(-1);
    expect(hoursIdx).toBe(deliveryIdx + 1);
    expect(ownerIdx).toBe(hoursIdx + 1);
  });

  it('工数目安の手動入力欄が狭い固定幅クラスを持つ', async () => {
    currentProject = { ...baseProject, estimated_factory_hours: 0, estimated_site_hours: 0, manual_estimated_hours: 4.5, effective_estimated_hours: 4.5 };
    stubFetch();
    renderPage();
    await screen.findByDisplayValue('既存案件');

    const input = await screen.findByLabelText('工数目安（h）') as HTMLInputElement;
    expect(input.className).not.toMatch(/\bw-full\b/);
    expect(input.className).toMatch(/\bw-(1[0-9]|2[0-4])\b/);
  });

  it('見積伝票からの自動計算表示も幅が詰められている（w-fullを持たない）', async () => {
    currentProject = { ...baseProject, estimated_factory_hours: 24, estimated_site_hours: 8, manual_estimated_hours: null, effective_estimated_hours: 32 };
    stubFetch();
    renderPage();
    await screen.findByDisplayValue('既存案件');

    const display = await screen.findByText(/見積伝票から自動計算: 32時間（4\.0日）/);
    expect(display.className).not.toMatch(/\bw-full\b/);
  });

  it('受注日・開始日・納品日・納期の日付入力欄がw-fullではなく固定幅クラスを持つ', async () => {
    currentProject = { ...baseProject, estimated_factory_hours: 0, estimated_site_hours: 0, manual_estimated_hours: null, effective_estimated_hours: null };
    stubFetch();
    const { container } = renderPage();
    await screen.findByDisplayValue('既存案件');

    const dateLabels = ['受注日', '開始日', '納品日', '納期'];
    for (const label of dateLabels) {
      const labelEl = Array.from(container.querySelectorAll('label')).find(el => el.textContent === label);
      expect(labelEl).toBeTruthy();
      const input = labelEl!.nextElementSibling as HTMLInputElement;
      expect(input.tagName).toBe('INPUT');
      expect(input.type).toBe('date');
      expect(input.className).not.toMatch(/\bw-full\b/);
      expect(input.className).toMatch(/\bw-\d+\b/);
    }
  });
});
