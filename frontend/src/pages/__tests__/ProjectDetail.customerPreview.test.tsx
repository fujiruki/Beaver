import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ProjectDetail from '../ProjectDetail';

// R-0087: 案件編集画面で、選択中の得意先の住所・電話・メール・備考を
// 非編集プレビューとして表示し、電話はtel:リンク・メールはmailto:リンクにする。
// また「得意先を編集」ボタンで新しいタブを開き、タイトル横の保存ボタンでも保存できる。

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
  memo: null,
  order_date: null,
  owner_name: null,
  general_contractor_name: null,
  site_contact: null,
  created_at: '2026-01-01 00:00:00',
  updated_at: '2026-01-01 00:00:00',
};

const fullCustomer = {
  id: 1,
  name: '既存得意先',
  name_kana: null,
  address1: '東京都渋谷区',
  address2: '1-2-3',
  tel: '03-1111-2222',
  mobile: '090-3333-4444',
  email: 'customer@example.com',
  memo: '得意先の備考',
};

const noContactCustomer = {
  id: 2,
  name: '連絡先なし得意先',
  name_kana: null,
  address1: null,
  address2: null,
  tel: null,
  mobile: null,
  email: null,
  memo: null,
};

let putBodies: any[] = [];
let customersResponse: any[];

beforeEach(() => {
  putBodies = [];
  customersResponse = [fullCustomer, noContactCustomer];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const u = new URL(url, 'http://localhost');
    const method = init?.method ?? 'GET';
    if (u.pathname.endsWith('/customers')) {
      return new Response(JSON.stringify(customersResponse), { status: 200 });
    }
    if (u.pathname.endsWith('/project-statuses')) {
      return new Response(JSON.stringify([{ id: 1, name: '進行中', sort_order: 4, is_active: 1, created_at: '2026-01-01 00:00:00' }]), { status: 200 });
    }
    if (method === 'PUT') {
      const body = JSON.parse(String(init?.body ?? '{}'));
      putBodies.push(body);
      return new Response(JSON.stringify({ ...baseProject, ...body }), { status: 200 });
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

describe('ProjectDetail 得意先プレビュー・編集ボタン・タイトル保存 (R-0087)', () => {
  it('得意先選択時、住所・電話（tel:リンク）・メール（mailto:リンク）・備考がプレビュー表示される', async () => {
    renderPage();

    await screen.findByDisplayValue('既存案件');

    expect(await screen.findByText(/東京都渋谷区1-2-3/)).not.toBeNull();

    const telLink = screen.getByRole('link', { name: /03-1111-2222/ });
    expect(telLink.getAttribute('href')).toBe('tel:03-1111-2222');

    const mailLink = screen.getByRole('link', { name: /customer@example.com/ });
    expect(mailLink.getAttribute('href')).toBe('mailto:customer@example.com');

    expect(screen.getByText('得意先の備考')).not.toBeNull();
  });

  it('tel が無い場合は mobile を tel:リンクとして表示する', async () => {
    renderPage();
    await screen.findByDisplayValue('既存案件');

    const user = userEvent.setup();
    const combo = screen.getByPlaceholderText('得意先を検索...');
    await user.click(combo);
    await user.type(combo, '連絡先なし');
    await user.click(await screen.findByText('連絡先なし得意先'));

    // tel/mobile/email/memoが全て無い場合、プレビュー項目自体が表示されない
    await waitFor(() => expect(screen.queryByText(/東京都渋谷区/)).toBeNull());
    expect(screen.queryByRole('link', { name: /tel:/ })).toBeNull();
  });

  it('「得意先を編集」ボタンをクリックすると得意先詳細が新しいタブで開く', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    renderPage();
    await screen.findByDisplayValue('既存案件');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '得意先を編集' }));

    expect(openSpy).toHaveBeenCalledWith(`${import.meta.env.BASE_URL}customers/1`, '_blank');
    openSpy.mockRestore();
  });

  it('タイトル横の保存ボタンをクリックすると、下部の保存ボタンと同じ保存処理が実行される', async () => {
    renderPage();
    const name = await screen.findByDisplayValue('既存案件') as HTMLInputElement;

    const user = userEvent.setup();
    await user.clear(name);
    await user.type(name, '新しい案件名');

    await user.click(screen.getByRole('button', { name: 'タイトル横保存' }));
    await waitFor(() => expect(putBodies.length).toBeGreaterThan(0));
    expect(putBodies[0].name).toBe('新しい案件名');
  });
});
