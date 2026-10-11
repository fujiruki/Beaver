import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import AppSettings from '../AppSettings';
import { AppSettingsProvider } from '../../contexts/AppSettingsContext';

const requests: Array<{ url: string; method: string; body: any }> = [];

beforeEach(() => {
  localStorage.clear();
  requests.length = 0;
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    requests.push({ url, method, body });
    if (url.endsWith('/settings')) {
      return new Response(JSON.stringify({ id: 1, default_labor_rate: method === 'PUT' ? body.default_labor_rate : 5000 }));
    }
    if (url.endsWith('/aggregation-categories')) return new Response('[]');
    return new Response('{}');
  }));
});

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AppSettingsProvider>
        <MemoryRouter><AppSettings /></MemoryRouter>
      </AppSettingsProvider>
    </QueryClientProvider>,
  );
}

describe('AppSettings R-0174 既定労務単価は会社設定', () => {
  it('会社設定の既定労務単価を表示する（localStorageの値は使わない）', async () => {
    localStorage.setItem('bv_app_settings', JSON.stringify({ defaultLaborRate: 4500 }));
    renderPage();
    expect(await screen.findByDisplayValue('5000')).toBeTruthy();
    expect(screen.queryByDisplayValue('4500')).toBeNull();
  });

  it('既定労務単価を編集するとPUT /settingsに送る', async () => {
    const user = userEvent.setup();
    renderPage();
    const input = await screen.findByDisplayValue('5000');
    await user.clear(input);
    await user.type(input, '6000');
    await user.tab();
    await waitFor(() => {
      const puts = requests.filter(r => r.method === 'PUT' && r.url.endsWith('/settings'));
      expect(puts.at(-1)?.body).toEqual({ default_labor_rate: 6000 });
    });
  });
});
