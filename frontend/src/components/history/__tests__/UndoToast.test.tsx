import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import UndoToast from '../UndoToast';

describe('UndoToast (R-0098)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('メッセージと「元に戻す」ボタンを表示する', () => {
    render(<UndoToast message="入金を削除しました" onUndo={() => {}} onDismiss={() => {}} />);
    expect(screen.getByText('入金を削除しました')).not.toBeNull();
    expect(screen.getByRole('button', { name: '元に戻す' })).not.toBeNull();
  });

  it('「元に戻す」ボタンでonUndoが呼ばれる', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onUndo = vi.fn();
    render(<UndoToast message="削除しました" onUndo={onUndo} onDismiss={() => {}} />);
    await user.click(screen.getByRole('button', { name: '元に戻す' }));
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it('閉じるボタンでonDismissが呼ばれる', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onDismiss = vi.fn();
    render(<UndoToast message="削除しました" onUndo={() => {}} onDismiss={onDismiss} />);
    await user.click(screen.getByRole('button', { name: '閉じる' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('一定時間経過で自動的にonDismissが呼ばれる', () => {
    const onDismiss = vi.fn();
    render(<UndoToast message="削除しました" onUndo={() => {}} onDismiss={onDismiss} autoDismissMs={5000} />);
    expect(onDismiss).not.toHaveBeenCalled();
    vi.advanceTimersByTime(5000);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('pending中は「元に戻す」ボタンが無効化される', () => {
    render(<UndoToast message="削除しました" onUndo={() => {}} onDismiss={() => {}} pending />);
    expect(screen.getByRole('button', { name: '元に戻しています...' })).toHaveProperty('disabled', true);
  });
});
