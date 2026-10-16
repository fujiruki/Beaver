import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import CustomerDetail from '../CustomerDetail';

describe('R-0181: 得意先新規登録の401', () => {
  it('入力と未保存表示を残し、赤い生エラーや未処理例外を出さない', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      error: 'unauthenticated', loginUrl: 'https://example.test/login',
    }), { status: 401 })));
    const unhandled = vi.fn();
    window.addEventListener('unhandledrejection', unhandled);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={['/customers/new']}><Routes><Route path="/customers/new" element={<CustomerDetail />} /></Routes></MemoryRouter></QueryClientProvider>);

    const input = document.querySelector<HTMLInputElement>('input[name="name"]');
    expect(input).not.toBeNull();
    if (!input) throw new Error('得意先名入力がありません');
    fireEvent.change(input, { target: { value: '入力を残す得意先' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(input.value).toBe('入力を残す得意先');
    expect(screen.getByTestId('save-status')).not.toBeNull();
    expect(screen.queryByText(/API error 401/)).toBeNull();
    expect(unhandled).not.toHaveBeenCalled();
    window.removeEventListener('unhandledrejection', unhandled);
  });
});
