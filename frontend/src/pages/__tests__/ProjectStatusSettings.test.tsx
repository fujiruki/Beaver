import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ProjectStatusSettings from '../ProjectStatusSettings';

let statuses: { id: number; name: string; sort_order: number; is_active: number; created_at: string }[];
let nextId: number;
let deletedIds: number[];

beforeEach(() => {
  statuses = [
    { id: 1, name: '問い合わせ', sort_order: 1, is_active: 1, created_at: '2026-01-01 00:00:00' },
    { id: 2, name: '見積済', sort_order: 2, is_active: 1, created_at: '2026-01-01 00:00:00' },
  ];
  nextId = 3;
  deletedIds = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const u = new URL(url, 'http://localhost');
    const method = init?.method ?? 'GET';
    if (u.pathname.endsWith('/project-statuses') && method === 'GET') {
      return new Response(JSON.stringify(statuses), { status: 200 });
    }
    if (u.pathname.endsWith('/project-statuses') && method === 'POST') {
      const body = JSON.parse(String(init?.body ?? '{}'));
      const created = { id: nextId++, sort_order: statuses.length + 1, is_active: 1, created_at: '2026-01-01 00:00:00', ...body };
      statuses = [...statuses, created];
      return new Response(JSON.stringify(created), { status: 201 });
    }
    if (u.pathname.includes('/project-statuses/') && method === 'DELETE') {
      const id = Number(u.pathname.split('/').pop());
      deletedIds.push(id);
      statuses = statuses.filter(s => s.id !== id);
      return new Response(JSON.stringify({ deleted: true }), { status: 200 });
    }
    return new Response('{}', { status: 200 });
  }));
});

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ProjectStatusSettings />
    </QueryClientProvider>,
  );
}

describe('ProjectStatusSettings (R-0085)', () => {
  it('既存のステータス一覧を表示する', async () => {
    renderPage();
    expect(await screen.findByText('問い合わせ')).not.toBeNull();
    expect(await screen.findByText('見積済')).not.toBeNull();
  });

  it('新規ステータスを追加できる', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('問い合わせ');

    const input = screen.getByPlaceholderText('ステータス名（例：発注済）');
    await user.type(input, 'キャンセル');
    await user.click(screen.getByRole('button', { name: '追加' }));

    expect(await screen.findByText('キャンセル')).not.toBeNull();
  });

  it('削除ボタンでDELETEが呼ばれる', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true));
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('見積済');

    const rows = screen.getAllByRole('row');
    const targetRow = rows.find(r => r.textContent?.includes('見積済'))!;
    const deleteBtn = targetRow.querySelector('button:last-child') as HTMLButtonElement;
    await user.click(deleteBtn);

    await waitFor(() => expect(deletedIds).toContain(2));
  });
});
