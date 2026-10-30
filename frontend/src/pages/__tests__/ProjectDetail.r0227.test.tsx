import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ProjectDetail from '../ProjectDetail';
import ProjectSchedulesPanel from '../../components/ProjectSchedulesPanel';

const project = {
  id: 5,
  project_code: 'P-0005',
  name: '既存案件',
  customer_id: 1,
  description: null,
  address: '施工住所',
  status: '見積中',
  start_date: null,
  end_date: '2026-11-20',
  delivery_date: '2026-11-18',
  memo: '元の説明',
  order_date: '2026-10-27',
  owner_name: '施主名',
  general_contractor_name: '元請名',
  site_contact: '担当者',
  manual_estimated_hours: null,
  estimated_factory_hours: 19.5,
  estimated_site_hours: 9,
  effective_estimated_hours: 28.5,
  vouchers: [],
  images: [],
  created_at: '2026-01-01 00:00:00',
  updated_at: '2026-01-01 00:00:00',
};

let putBodies: Record<string, unknown>[];
let failPut = false;
let scheduleWrites: { method: string; path: string }[];
let currentProject = project;

function queryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function renderPage() {
  return render(
    <QueryClientProvider client={queryClient()}>
      <MemoryRouter initialEntries={['/projects/5']}>
        <Routes>
          <Route path="/projects/:id" element={<ProjectDetail />} />
          <Route path="/projects" element={<div>案件一覧</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ProjectDetail R-0227', () => {
  beforeEach(() => {
    putBodies = [];
    failPut = false;
    scheduleWrites = [];
    currentProject = project;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const path = new URL(url, 'http://localhost').pathname;
      const method = init?.method ?? 'GET';
      if (path.endsWith('/customers')) {
        return new Response(JSON.stringify([{
          id: 1,
          name: '既存得意先',
          name_kana: null,
          memo: null,
        }]), { status: 200 });
      }
      if (path.endsWith('/project-statuses')) {
        return new Response(JSON.stringify([{
          id: 1,
          name: '見積中',
          sort_order: 1,
          is_active: 1,
          created_at: '',
        }]), { status: 200 });
      }
      if (path.endsWith('/schedules') && method === 'GET') {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      if (path.endsWith('/schedules') && method === 'POST') {
        scheduleWrites.push({ method, path });
        return new Response(JSON.stringify({
          id: 99, project_id: 5, kind: '見積', name: '', start_date: '2026-11-01',
          end_date: null, hours: null, memo: '', done: 0, created_at: '', updated_at: '',
        }), { status: 201 });
      }
      if (/\/schedules\/99$/.test(path) && method === 'DELETE') {
        scheduleWrites.push({ method, path });
        return new Response(null, { status: 204 });
      }
      if (method === 'PUT') {
        const body = JSON.parse(String(init?.body ?? '{}'));
        putBodies.push(body);
        if (failPut) return new Response(JSON.stringify({ error: '失敗' }), { status: 500 });
        return new Response(JSON.stringify({ ...currentProject, ...body }), { status: 200 });
      }
      return new Response(JSON.stringify(currentProject), { status: 200 });
    }));
  });

  it('既存案件は左列と右列に指定された順で欄を配置する', async () => {
    renderPage();
    await screen.findByDisplayValue('既存案件');

    const left = screen.getByTestId('project-detail-left-column');
    const right = screen.getByTestId('project-detail-right-column');

    expect(within(left).getAllByRole('heading', { level: 2 }).map(el => el.textContent))
      .toEqual(['案件の要点', '予定', '見積伝票', '売上伝票']);
    expect(within(right).getAllByRole('heading', { level: 2 }).slice(0, 3).map(el => el.textContent))
      .toEqual(['基本情報', '画像', 'Youkan']);
    expect(screen.queryByRole('button', { name: /保存/ })).toBeNull();
  });

  it('案件名は欄を出たとき変更項目だけ保存し、元に戻すと前の値を保存する', async () => {
    const user = userEvent.setup();
    renderPage();

    const name = await screen.findByLabelText('案件名');
    await user.clear(name);
    await user.type(name, '変更後の案件');
    await user.tab();

    await waitFor(() => expect(putBodies).toHaveLength(1));
    expect(putBodies[0]).toEqual({ name: '変更後の案件' });
    await user.click(await screen.findByRole('button', { name: '元に戻す' }));
    await waitFor(() => expect(putBodies).toHaveLength(2));
    expect(putBodies[1]).toEqual({ name: '既存案件' });
  });

  it('ステータスを押すとその項目をすぐ保存する', async () => {
    renderPage();
    await screen.findByDisplayValue('既存案件');
    fireEvent.click(screen.getByRole('button', { name: '見積中' }));
    await waitFor(() => expect(putBodies).toEqual([{ status: '見積中' }]));
  });

  it('保存失敗の案内は消えずに残る', async () => {
    failPut = true;
    renderPage();
    const name = await screen.findByLabelText('案件名');
    fireEvent.change(name, { target: { value: '失敗する変更' } });
    fireEvent.blur(name);
    expect(await screen.findByText(/保存できませんでした/)).toBeTruthy();
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(screen.getByText(/保存できませんでした/)).toBeTruthy();
  });

  it('見積工数があれば見積由来を表示し、工数目安の入力と早押しを出さない', async () => {
    renderPage();
    const keyPoints = await screen.findByTestId('project-key-points');

    expect(within(keyPoints).getByText('見積から')).toBeTruthy();
    expect(screen.queryByLabelText('工数目安（h）')).toBeNull();
    expect(screen.queryByRole('button', { name: '4h' })).toBeNull();
  });

  it('見積工数がなければ工数目安の入力と早押しを出す', async () => {
    currentProject = {
      ...project,
      estimated_factory_hours: 0,
      estimated_site_hours: 0,
      effective_estimated_hours: 0,
    };
    renderPage();
    expect(await screen.findByLabelText('工数目安（h）')).toBeTruthy();
    expect(screen.getByRole('button', { name: '4h' })).toBeTruthy();
  });

  it('予定を作った直後に元に戻すと作成した予定を削除する', async () => {
    renderPage();
    const start = (await screen.findAllByLabelText('見積の開始'))[0];
    fireEvent.change(start, { target: { value: '2026-11-01' } });
    fireEvent.blur(start, { relatedTarget: document.body });
    await waitFor(() => expect(scheduleWrites[0]?.method).toBe('POST'));
    fireEvent.click(await screen.findByRole('button', { name: '元に戻す' }));
    await waitFor(() => expect(scheduleWrites[1]).toEqual({
      method: 'DELETE',
      path: '/contents/Beaver/api/projects/5/schedules/99',
    }));
  });
});

describe('ProjectSchedulesPanel R-0227', () => {
  it('済を先頭列に置き、その他の種類セルには工程名だけを表示する', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([{
      id: 1,
      project_id: 5,
      kind: 'その他',
      name: '採寸',
      start_date: '2026-11-01',
      end_date: null,
      hours: 1,
      memo: '',
      done: 0,
      created_at: '',
      updated_at: '',
    }]), { status: 200 })));
    const { container } = render(
      <QueryClientProvider client={queryClient()}>
        <ProjectSchedulesPanel projectId={5} />
      </QueryClientProvider>,
    );

    await screen.findByDisplayValue('採寸');
    const headers = screen.getAllByRole('columnheader').map(el => el.textContent);
    expect(headers[0]).toBe('済');

    const row = container.querySelector('tbody tr:not([data-kind])')!;
    const kindCell = row.querySelector<HTMLElement>('td:nth-child(2)')!;
    expect(within(kindCell).queryByText('その他')).toBeNull();
    expect((within(kindCell).getByLabelText('予定の工程名') as HTMLInputElement).value)
      .toBe('採寸');
    expect(within(row.querySelector<HTMLElement>('td:first-child')!).getByLabelText('予定が済'))
      .toBeTruthy();

    fireEvent.blur(screen.getByDisplayValue('採寸'));
  });
});
