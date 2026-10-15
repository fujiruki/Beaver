import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RootErrorPage } from '../RootErrorPage';

describe('R-0178: ルートのエラー画面', () => {
  const originalLocation = window.location;

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
});
