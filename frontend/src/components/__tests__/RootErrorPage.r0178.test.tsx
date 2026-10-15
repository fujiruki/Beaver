import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ID } from '../../lib/appId';
import { RootErrorPage } from '../RootErrorPage';

const { useRouteError } = vi.hoisted(() => ({
  useRouteError: vi.fn<() => unknown>(),
}));

vi.mock('react-router-dom', () => ({ useRouteError }));

describe('R-0178: ルートのエラー画面', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    sessionStorage.clear();
    useRouteError.mockReturnValue(undefined);
  });

  afterEach(() => {
    // @ts-expect-error テスト用locationを元へ戻す
    window.location = originalLocation;
  });

  it('案内と再読み込みボタンを表示する', async () => {
    const reload = vi.fn();
    // @ts-expect-error テストで再読み込みを観測できるlocationへ置き換える
    delete window.location;
    // @ts-expect-error テスト用locationの代入を許可する
    window.location = { ...originalLocation, reload } as Location;

    render(<RootErrorPage />);

    expect(screen.getByText('画面を読み込めませんでした。ページを再読み込みしてください。')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: '再読み込み' }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('10秒以内に再発した読み込みエラーには更新案内を表示する', () => {
    sessionStorage.setItem(`${APP_ID}_chunk_reload_at`, String(Date.now()));
    useRouteError.mockReturnValue(
      new TypeError('Failed to fetch dynamically imported module: /assets/ProjectDetail-old.js'),
    );

    render(<RootErrorPage />);

    expect(screen.getByText('Beaverが新しくなったため、画面を読み込めませんでした。')).toBeTruthy();
    expect(screen.getByRole('button', { name: '再読み込み' })).toBeTruthy();
    expect(screen.queryByText(/Unexpected Application Error/i)).toBeNull();
    expect(screen.queryByText(/Failed to fetch dynamically imported module/i)).toBeNull();
  });
});
