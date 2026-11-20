import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { api, AUTH_REQUIRED_EVENT } from '../client';

describe('R-0109: 401応答時のauth-hubログイン画面リダイレクト', () => {
  let originalLocation: Location;

  beforeEach(() => {
    originalLocation = window.location;
    // @ts-expect-error jsdomのlocationはテストのため置き換える
    delete window.location;
    // @ts-expect-error 上記の置き換えを補うテスト用スタブ
    window.location = { href: '', pathname: '/contents/Beaver/vouchers/5', search: '?tab=a', hash: '#h' } as Location;
  });

  afterEach(() => {
    // @ts-expect-error jsdomのlocationはテストのため復元する
    window.location = originalLocation;
  });

  const SCREEN = encodeURIComponent('/contents/Beaver/vouchers/5?tab=a#h');

  it('loginUrlを含む401応答を受けると、redirectを開いている画面に差し替えたURLへ遷移する', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ error: 'unauthenticated', loginUrl: 'https://door-fujita.com/contents/auth/login?redirect=%2Fcontents%2FBeaver%2Fapi%2Finvoices' }), { status: 401 }),
    ));

    void api.get('/customers');
    await vi.waitFor(() => expect(window.location.href).toBe(`https://door-fujita.com/contents/auth/login?redirect=${SCREEN}`));
  });

  it('loginUrlが相対URLでも土台を保ったままredirectだけ画面に差し替える', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ error: 'unauthenticated', loginUrl: '/contents/auth/login?redirect=%2Fcontents%2FBeaver%2Fapi%2Finvoices%3Fyear%3D2026' }), { status: 401 }),
    ));

    void api.get('/invoices');
    await vi.waitFor(() => expect(window.location.href).toBe(`/contents/auth/login?redirect=${SCREEN}`));
  });

  it('書き込みの401では、イベントのloginUrlのredirectも開いている画面に差し替える', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ error: 'unauthenticated', loginUrl: 'https://door-fujita.com/contents/auth/login?redirect=%2Fcontents%2FBeaver%2Fapi%2Fvouchers' }), { status: 401 }),
    ));
    const onAuth = vi.fn();
    window.addEventListener(AUTH_REQUIRED_EVENT, onAuth);

    await expect(api.post('/vouchers', {})).rejects.toThrow('API error 401');
    window.removeEventListener(AUTH_REQUIRED_EVENT, onAuth);
    expect((onAuth.mock.calls[0][0] as CustomEvent).detail.loginUrl)
      .toBe(`https://door-fujita.com/contents/auth/login?redirect=${SCREEN}`);
  });

  it('loginUrlを含まない401応答は通常通りエラーを投げる（対象外エンドポイント等）', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 }),
    ));

    await expect(api.get('/admin/feedback')).rejects.toThrow('API error 401');
  });
});
