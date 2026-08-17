import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { api } from '../client';

describe('R-0109: 401応答時のauth-hubログイン画面リダイレクト', () => {
  let originalLocation: Location;

  beforeEach(() => {
    originalLocation = window.location;
    // @ts-expect-error jsdomのlocationはテストのため置き換える
    delete window.location;
    // @ts-expect-error 上記の置き換えを補うテスト用スタブ
    window.location = { href: '' } as Location;
  });

  afterEach(() => {
    // @ts-expect-error jsdomのlocationはテストのため復元する
    window.location = originalLocation;
  });

  it('loginUrlを含む401応答を受けるとそのURLへ遷移する', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ error: 'unauthenticated', loginUrl: 'https://door-fujita.com/contents/auth/login?redirect=x' }), { status: 401 }),
    ));

    void api.get('/customers');
    await vi.waitFor(() => expect(window.location.href).toBe('https://door-fujita.com/contents/auth/login?redirect=x'));
  });

  it('loginUrlを含まない401応答は通常通りエラーを投げる（対象外エンドポイント等）', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 }),
    ));

    await expect(api.get('/admin/feedback')).rejects.toThrow('API error 401');
  });
});
