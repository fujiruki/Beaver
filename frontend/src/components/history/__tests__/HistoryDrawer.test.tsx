import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import HistoryDrawer from '../HistoryDrawer';

function renderDrawer(props: Partial<React.ComponentProps<typeof HistoryDrawer>> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const onClose = vi.fn();
  render(
    <QueryClientProvider client={qc}>
      <HistoryDrawer open entity="customers" entityId={1} onClose={onClose} {...props} />
    </QueryClientProvider>,
  );
  return { onClose };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('HistoryDrawer (R-0098)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('open=falseのときは何も表示しない', () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse([]));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <HistoryDrawer open={false} entity="customers" entityId={1} onClose={() => {}} />
      </QueryClientProvider>,
    );
    expect(screen.queryByText('変更履歴')).toBeNull();
  });

  it('customersの更新履歴で変更列だけ差分表示する', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse([
      {
        id: 10, entity: 'customers', entity_id: 1, action: 'update',
        before_json: JSON.stringify({ row: { id: 1, name: '旧名前', tel: '06-1111-1111' }, related: {} }),
        after_json: JSON.stringify({ row: { id: 1, name: '新名前', tel: '06-1111-1111' }, related: {} }),
        clamped: 0, changed_by: null, changed_by_name: null, created_at: '2026-08-06 10:00:00',
      },
    ]));

    renderDrawer();

    expect(await screen.findByText(/旧名前/)).not.toBeNull();
    expect(screen.getByText(/新名前/)).not.toBeNull();
    expect(screen.queryByText(/06-1111-1111/)).toBeNull();
  });

  it('「この時点に戻す」→確認→復元で復元APIが呼ばれ現在値が表示される', async () => {
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/history/10/restore')) {
        return jsonResponse({ id: 1, name: '旧名前', tel: '06-1111-1111', carry_forward_balance: 500 });
      }
      if (url.includes('/history?')) {
        return jsonResponse([
          {
            id: 10, entity: 'customers', entity_id: 1, action: 'update',
            before_json: JSON.stringify({ row: { id: 1, name: '旧名前' }, related: {} }),
            after_json: JSON.stringify({ row: { id: 1, name: '新名前' }, related: {} }),
            clamped: 0, changed_by: null, changed_by_name: null, created_at: '2026-08-06 10:00:00',
          },
        ]);
      }
      return jsonResponse({});
    });

    const user = userEvent.setup();
    renderDrawer();

    await user.click(await screen.findByRole('button', { name: 'この時点に戻す' }));
    await user.click(await screen.findByRole('button', { name: '復元する' }));

    expect(await screen.findByText('復元しました。現在の値をご確認ください。')).not.toBeNull();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/history/10/restore'), expect.objectContaining({ method: 'POST' }));
  });

  it('最新でない履歴には警告が表示される', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse([
      {
        id: 20, entity: 'customers', entity_id: 1, action: 'update',
        before_json: JSON.stringify({ row: { id: 1, name: '直近の前' }, related: {} }),
        after_json: JSON.stringify({ row: { id: 1, name: '最新' }, related: {} }),
        clamped: 0, changed_by: null, changed_by_name: null, created_at: '2026-08-06 12:00:00',
      },
      {
        id: 10, entity: 'customers', entity_id: 1, action: 'update',
        before_json: JSON.stringify({ row: { id: 1, name: '一番古い' }, related: {} }),
        after_json: JSON.stringify({ row: { id: 1, name: '直近の前' }, related: {} }),
        clamped: 0, changed_by: null, changed_by_name: null, created_at: '2026-08-06 10:00:00',
      },
    ]));

    renderDrawer();

    await waitFor(() => expect(screen.getAllByText(/この復元より後に関連する変更があります/)).toHaveLength(1));
  });
});
