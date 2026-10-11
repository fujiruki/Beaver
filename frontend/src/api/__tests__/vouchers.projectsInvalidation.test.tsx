import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useAddLine, useCreateVoucher, useDeleteLine, useUnvoidVoucher, useUpdateLine, useUpdateVoucher, useVoidVoucher,
} from '../vouchers';

// 案件画面の伝票一覧（projects の [KEY, id]）は伝票の変更後に取り直す必要がある
function setup(response: unknown) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(response))));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  client.setQueryData(['projects', 7], { id: 7, vouchers: [{ id: 5, status: 'void' }] });
  client.setQueryData(['projects', { status: 'active' }], []);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

function expectProjectsInvalidated(client: QueryClient) {
  expect(client.getQueryState(['projects', 7])?.isInvalidated).toBe(true);
  expect(client.getQueryState(['projects', { status: 'active' }])?.isInvalidated).toBe(true);
}

afterEach(() => vi.unstubAllGlobals());

describe('伝票の変更で案件のクエリも無効化する', () => {
  it('下書きに戻す（unvoid）成功後に案件のクエリが無効化される', async () => {
    const { client, wrapper } = setup({ result: 'unvoided', voucher_updated_at: '2026-10-12 10:00:00' });
    const { result } = renderHook(() => useUnvoidVoucher(), { wrapper });
    await result.current.mutateAsync({ id: 5 });
    await waitFor(() => expectProjectsInvalidated(client));
  });

  it('取消（void）成功後に案件のクエリが無効化される', async () => {
    const { client, wrapper } = setup({ result: 'voided' });
    const { result } = renderHook(() => useVoidVoucher(), { wrapper });
    await result.current.mutateAsync({ id: 5 });
    await waitFor(() => expectProjectsInvalidated(client));
  });

  it('物理削除後も案件のクエリは無効化し、削除した伝票の詳細は取り直さない', async () => {
    const { client, wrapper } = setup({ result: 'deleted' });
    client.setQueryData(['vouchers', 5], { id: 5 });
    const { result } = renderHook(() => useVoidVoucher(), { wrapper });
    await result.current.mutateAsync({ id: 5 });
    await waitFor(() => expectProjectsInvalidated(client));
    expect(client.getQueryState(['vouchers', 5])?.isInvalidated).toBe(false);
  });

  it('伝票作成成功後に案件のクエリが無効化される', async () => {
    const { client, wrapper } = setup({ id: 9 });
    const { result } = renderHook(() => useCreateVoucher(), { wrapper });
    await result.current.mutateAsync({} as never);
    await waitFor(() => expectProjectsInvalidated(client));
  });

  it('伝票ヘッダー更新成功後に案件のクエリが無効化される', async () => {
    const { client, wrapper } = setup({ id: 5 });
    const { result } = renderHook(() => useUpdateVoucher(5), { wrapper });
    await result.current.mutateAsync({ description: 'x' });
    await waitFor(() => expectProjectsInvalidated(client));
  });

  it('明細行の追加・更新・削除後に案件のクエリが無効化される（合計金額が変わるため）', async () => {
    for (const useHook of [useAddLine, useDeleteLine, useUpdateLine] as const) {
      const { client, wrapper } = setup({ id: 1, voucher_updated_at: '2026-10-12 10:00:00' });
      const { result } = renderHook(() => (useHook as (id: number) => { mutateAsync: (v: never) => Promise<unknown> })(5), { wrapper });
      await result.current.mutateAsync({ lineId: 1, data: {} } as never);
      await waitFor(() => expectProjectsInvalidated(client));
    }
  });
});
