import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import CustomerDetail from '../CustomerDetail';

const baseCustomer = {
  id: 3,
  code: '1',
  name: '既存得意先',
  name_kana: 'キゾントクイサキ',
  honorific_type: '御中',
  gender: null,
  postal_code: null,
  address1: null,
  address2: null,
  tel: null,
  mobile: null,
  fax: null,
  email: null,
  memo: '元のメモ',
  billing_name: null,
  billing_date_print: 0,
  cutoff_day: 31,
  billing_offset_days: 15,
  payment_due_days: 30,
  carry_forward_balance: 0,
  is_active: 1,
  access_customer_no: null,
  created_at: '2026-01-01 00:00:00',
  updated_at: '2026-01-01 00:00:00',
};

let putBodies: any[] = [];
let currentCustomer: typeof baseCustomer;

beforeEach(() => {
  putBodies = [];
  currentCustomer = { ...baseCustomer };
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    if (method === 'PUT') {
      const body = JSON.parse(String(init?.body ?? '{}'));
      putBodies.push(body);
      return new Response(JSON.stringify({ ...currentCustomer, ...body }), { status: 200 });
    }
    return new Response(JSON.stringify(currentCustomer), { status: 200 });
  }));
});

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/customers/3']}>
        <Routes>
          <Route path="/customers/:id" element={<CustomerDetail />} />
          <Route path="/customers" element={<div>一覧画面</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('CustomerDetail 保存', () => {
  it('備考を編集して保存すると、編集後の値がPUTで送信される', async () => {
    const user = userEvent.setup();
    renderPage();

    const memo = await screen.findByDisplayValue('元のメモ') as HTMLTextAreaElement;
    await user.clear(memo);
    await user.type(memo, '編集後のメモ');

    await user.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(putBodies.length).toBeGreaterThan(0));
    expect(putBodies[0].memo).toBe('編集後のメモ');
  });

  it('フリガナを編集して保存すると、編集後の値がPUTで送信される', async () => {
    const user = userEvent.setup();
    renderPage();

    const kana = await screen.findByDisplayValue('キゾントクイサキ') as HTMLInputElement;
    await user.clear(kana);
    await user.type(kana, 'ヘンシュウゴ');

    await user.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(putBodies.length).toBeGreaterThan(0));
    expect(putBodies[0].name_kana).toBe('ヘンシュウゴ');
  });

  it('得意先名を編集して保存すると、編集後の値がPUTで送信される', async () => {
    const user = userEvent.setup();
    renderPage();

    const name = await screen.findByDisplayValue('既存得意先') as HTMLInputElement;
    await user.clear(name);
    await user.type(name, '新しい得意先名');

    await user.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(putBodies.length).toBeGreaterThan(0));
    expect(putBodies[0].name).toBe('新しい得意先名');
  });

  // R-067: メール欄に不正な値（例: Access取込のテスト得意先 id=719 の "めーる"）が入っていると、
  // type="email" のネイティブ検証が submit を黙ってブロックし、保存が一切行われなかった。
  it('メール欄が不正な値の得意先でも、編集して保存できる（PUTが送信される）', async () => {
    currentCustomer = { ...baseCustomer, email: 'めーる' as unknown as null };
    const user = userEvent.setup();
    renderPage();

    const memo = await screen.findByDisplayValue('元のメモ') as HTMLTextAreaElement;
    await user.clear(memo);
    await user.type(memo, '不正メール得意先の編集');

    await user.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(putBodies.length).toBeGreaterThan(0));
    expect(putBodies[0].memo).toBe('不正メール得意先の編集');
  });
});
