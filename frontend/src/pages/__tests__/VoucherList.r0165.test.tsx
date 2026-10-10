import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
import VoucherList from '../VoucherList';

let requestedUrls: string[] = [];

beforeEach(() => {
  localStorage.clear();
  requestedUrls = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const parsed = new URL(url, 'http://localhost');
    if (parsed.pathname.endsWith('/customers') || parsed.pathname.endsWith('/projects')) {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    requestedUrls.push(url);
    return new Response(JSON.stringify({
      data: [],
      meta: { total: 0, page: 1, per_page: 50, last_page: 0 },
    }), { status: 200 });
  }));
});

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.search}</div>;
}

function renderPage(initialEntry = '/vouchers') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <VoucherList />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('VoucherList 取消済み表示切替 (R-0165)', () => {
  it('受入条件4: 初期表示では exclude_void=1 を付ける', async () => {
    renderPage();
    await waitFor(() => expect(requestedUrls.length).toBeGreaterThan(0));
    const request = new URL(requestedUrls[requestedUrls.length - 1], 'http://localhost');
    expect(request.searchParams.get('exclude_void')).toBe('1');
    expect(screen.getByRole('checkbox', { name: '取消済みも表示' })).not.toBeChecked();
  });

  it('受入条件5: トグルをオンにすると除外指定を外し、include_void=1で1ページ目に戻る', async () => {
    renderPage('/vouchers?page=3');
    await waitFor(() => expect(requestedUrls.length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole('checkbox', { name: '取消済みも表示' }));

    await waitFor(() => {
      const request = new URL(requestedUrls[requestedUrls.length - 1], 'http://localhost');
      expect(request.searchParams.has('exclude_void')).toBe(false);
      expect(screen.getByTestId('location')).toHaveTextContent('?include_void=1');
    });
  });

  it('受入条件6: include_void=1 のURLから開くとトグルをオンで復元する', async () => {
    renderPage('/vouchers?include_void=1');
    const toggle = await screen.findByRole('checkbox', { name: '取消済みも表示' });
    expect(toggle).toBeChecked();
    await waitFor(() => expect(requestedUrls.length).toBeGreaterThan(0));
    const request = new URL(requestedUrls[requestedUrls.length - 1], 'http://localhost');
    expect(request.searchParams.has('exclude_void')).toBe(false);
  });
});
