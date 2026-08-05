import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ProjectDetail from '../ProjectDetail';

let customers: { id: number; name: string; name_kana: string | null; memo: string | null }[];
let nextId: number;

beforeEach(() => {
  customers = [{ id: 1, name: '既存得意先', name_kana: null, memo: null }];
  nextId = 2;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const u = new URL(url, 'http://localhost');

    if (u.pathname.endsWith('/customers') && method === 'GET') {
      return new Response(JSON.stringify(customers), { status: 200 });
    }
    if (u.pathname.endsWith('/customers') && method === 'POST') {
      const body = JSON.parse(String(init?.body ?? '{}'));
      const created = { id: nextId++, carry_forward_balance: 0, ...body };
      customers = [...customers, created];
      return new Response(JSON.stringify(created), { status: 201 });
    }
    if (u.pathname.endsWith('/project-statuses')) {
      return new Response(JSON.stringify([{ id: 1, name: '問い合わせ', sort_order: 1, is_active: 1, created_at: '2026-01-01 00:00:00' }]), { status: 200 });
    }
    return new Response('{}', { status: 200 });
  }));
});

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/projects/new']}>
        <Routes>
          <Route path="/projects/new" element={<ProjectDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('新規案件登録の得意先即時反映 (R-069改善点2)', () => {
  it('新規得意先を登録すると、得意先検索の候補に即座に反映される', async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByPlaceholderText('得意先を検索...');

    await user.click(screen.getByRole('button', { name: '＋ 新規得意先' }));

    // 案件名も同じname="name"を使うため、モーダル内（末尾に描画される方）を明示的に取得する
    const nameInputs = document.querySelectorAll('[name="name"]');
    const modalNameInput = nameInputs[nameInputs.length - 1] as HTMLInputElement;
    fireEvent.change(modalNameInput, { target: { value: '新しい得意先' } });

    await user.click(screen.getByRole('button', { name: '登録' }));

    await waitFor(() => expect(customers.some(c => c.name === '新しい得意先')).toBe(true));

    // ダイアログが閉じ、案件登録画面の得意先検索の選択値に新規得意先が即時反映される
    await waitFor(() => expect(screen.queryAllByRole('button', { name: '登録' }).length).toBe(0));
    expect(await screen.findByDisplayValue('新しい得意先')).not.toBeNull();
  });
});
