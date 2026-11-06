import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Link } from 'react-router-dom';
import CustomerList from '../CustomerList';
import ProjectList from '../ProjectList';
import VoucherList from '../VoucherList';
import TateguItemList from '../TateguItemList';
import InvoiceList from '../InvoiceList';

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const u = new URL(url, 'http://localhost');
    const paged = { data: [], meta: { total: 0, page: 1, per_page: 50, last_page: 1 } };
    if (u.pathname.endsWith('/customers') || u.pathname.endsWith('/projects')
      || u.pathname.endsWith('/invoices') || u.pathname.endsWith('/tategu-items')) {
      return new Response(JSON.stringify(u.searchParams.has('page') ? paged : []), { status: 200 });
    }
    return new Response(JSON.stringify(paged), { status: 200 });
  }));
});

function renderAt(ui: React.ReactElement, entry = '/') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[entry]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('一覧の画面を開いたら検索欄にカーソルを置く (R-0248)', () => {
  const cases: Array<[string, React.ReactElement, string]> = [
    ['得意先', <CustomerList />, '得意先名・コードで検索'],
    ['案件', <ProjectList />, '案件名・得意先名で検索'],
    ['伝票', <VoucherList />, '伝票番号・得意先・案件・摘要で検索'],
    ['製品台帳', <TateguItemList />, '品番・品名・仕様で検索'],
    ['請求書', <InvoiceList />, '請求書番号・得意先で検索'],
  ];

  it.each(cases)('%s一覧は開いた直後に検索欄がフォーカスされる', async (_name, ui, placeholder) => {
    renderAt(ui);
    const input = await screen.findByPlaceholderText(placeholder);
    await waitFor(() => expect(document.activeElement).toBe(input));
  });

  it('見積から売上に切り替えても検索欄がフォーカスされる', async () => {
    renderAt(
      <>
        <Link to="/?voucher_type=sales">売上へ</Link>
        <VoucherList />
      </>,
      '/?voucher_type=estimate',
    );
    const placeholder = '伝票番号・得意先・案件・摘要で検索';
    const first = await screen.findByPlaceholderText(placeholder);
    await waitFor(() => expect(document.activeElement).toBe(first));
    (document.activeElement as HTMLElement).blur();
    fireEvent.click(screen.getByText('売上へ'));
    await waitFor(() => {
      const next = screen.getByPlaceholderText(placeholder);
      expect(next).not.toBe(first);
      expect(document.activeElement).toBe(next);
    });
  });

  it('検索語が入っていれば選択状態でフォーカスされる', async () => {
    renderAt(<CustomerList />, '/?q=田中');
    const input = await screen.findByDisplayValue('田中') as HTMLInputElement;
    await waitFor(() => expect(document.activeElement).toBe(input));
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(2);
  });
});
