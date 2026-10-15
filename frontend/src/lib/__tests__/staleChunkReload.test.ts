import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ID } from '../appId';
import { installStaleChunkReloadHandler } from '../staleChunkReload';

describe('R-0178: 古いチャンクの読み込み失敗時の自動再読み込み', () => {
  const storageKey = `${APP_ID}_chunk_reload_at`;
  let originalLocation: Location;
  let reload: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sessionStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-15T00:00:00.000Z'));
    reload = vi.fn();
    originalLocation = window.location;
    // @ts-expect-error テストで再読み込みを観測できるlocationへ置き換える
    delete window.location;
    // @ts-expect-error テスト用locationの代入を許可する
    window.location = { ...originalLocation, reload } as Location;
  });

  afterEach(() => {
    // @ts-expect-error テスト用locationを元へ戻す
    window.location = originalLocation;
    vi.useRealTimers();
  });

  it('vite:preloadErrorで時刻を記録して1回再読み込みする', () => {
    const removeHandler = installStaleChunkReloadHandler();

    window.dispatchEvent(new Event('vite:preloadError', { cancelable: true }));

    expect(reload).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(storageKey)).toBe(String(Date.now()));
    removeHandler();
  });

  it('直前の自動再読み込みから10秒以内は再読み込みしない', () => {
    sessionStorage.setItem(storageKey, String(Date.now() - 9_999));
    const removeHandler = installStaleChunkReloadHandler();

    window.dispatchEvent(new Event('vite:preloadError', { cancelable: true }));

    expect(reload).not.toHaveBeenCalled();
    removeHandler();
  });

  it('直前の自動再読み込みから10秒より後なら再読み込みする', () => {
    sessionStorage.setItem(storageKey, String(Date.now() - 10_001));
    const removeHandler = installStaleChunkReloadHandler();

    window.dispatchEvent(new Event('vite:preloadError', { cancelable: true }));

    expect(reload).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(storageKey)).toBe(String(Date.now()));
    removeHandler();
  });
});
