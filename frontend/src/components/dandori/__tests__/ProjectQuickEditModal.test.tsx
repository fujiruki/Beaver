import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import ProjectQuickEditModal from '../ProjectQuickEditModal';

const project = {
  id: 7, project_code: 'P00007', name: '玄関工事', customer_id: 1,
  customer_name: '山田建設', description: null, address: null, status: '進行中',
  start_date: '2026-08-20', end_date: null, delivery_date: '2026-09-01', memo: '要確認',
  order_date: '2026-08-01', owner_name: null, general_contractor_name: null,
  site_contact: null, manual_estimated_hours: 8, created_at: '', updated_at: '',
};

function renderModal(onClose = vi.fn(), onSaved = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter><ProjectQuickEditModal projectId={7} onClose={onClose} onSaved={onSaved} /></MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ProjectQuickEditModal (R-0122)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const path = new URL(url, 'http://localhost').pathname;
      if (path.endsWith('/customers')) return new Response(JSON.stringify([{ id: 1, name: '山田建設' }, { id: 2, name: '鈴木工務店' }]));
      if (path.endsWith('/project-statuses')) return new Response(JSON.stringify([{ id: 1, name: '進行中' }, { id: 2, name: '完了' }]));
      if (init?.method === 'PUT') return new Response(JSON.stringify({ ...project, ...JSON.parse(String(init.body)) }));
      return new Response(JSON.stringify(project));
    }));
  });

  it('案件を表示し、編集内容を保存して段取り側へ通知する', async () => {
    const onSaved = vi.fn();
    const user = userEvent.setup();
    renderModal(vi.fn(), onSaved);
    const name = await screen.findByLabelText('案件名');
    expect(screen.getByDisplayValue('P00007')).toBeTruthy();
    await user.clear(name);
    await user.type(name, '玄関工事 更新');
    await user.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const put = (fetch as ReturnType<typeof vi.fn>).mock.calls.find(([, init]) => init?.method === 'PUT');
    expect(JSON.parse(String(put?.[1]?.body))).toMatchObject({ project_code: 'P00007', name: '玄関工事 更新', customer_id: 1 });
    expect(screen.getByRole('link', { name: '案件詳細を開く' }).getAttribute('href')).toBe('/projects/7');
  });

  it('キャンセルでは保存せず閉じる', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderModal(onClose);
    await screen.findByDisplayValue('玄関工事');
    await user.click(screen.getByRole('button', { name: 'キャンセル' }));
    expect(onClose).toHaveBeenCalledOnce();
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false);
  });
});
