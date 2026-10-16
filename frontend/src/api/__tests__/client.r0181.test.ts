import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, AUTH_REQUIRED_EVENT, AUTH_RESTORED_EVENT } from '../client';

describe('R-0181: 401時の書き込み案内', () => {
  let originalLocation: Location;

  beforeEach(() => {
    originalLocation = window.location;
    // @ts-expect-error テスト用locationへ置き換える
    delete window.location;
    // @ts-expect-error テスト用locationへ置き換える
    window.location = { href: 'https://door-fujita.com/contents/Beaver/customers/new' } as Location;
  });

  afterEach(() => {
    // @ts-expect-error テスト用locationを復元する
    window.location = originalLocation;
  });

  it('書き込み401では遷移せず認証案内イベントを通知してApiErrorを投げる', async () => {
    const listener = vi.fn();
    window.addEventListener(AUTH_REQUIRED_EVENT, listener);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      error: 'unauthenticated', loginUrl: 'https://door-fujita.com/contents/auth/login?redirect=x',
    }), { status: 401 })));

    await expect(api.post('/customers', { name: '入力中' })).rejects.toMatchObject({ status: 401 });
    expect(window.location.href).toContain('/customers/new');
    expect(listener).toHaveBeenCalledOnce();
    expect((listener.mock.calls[0][0] as CustomEvent).detail.loginUrl).toContain('/contents/auth/login');
    window.removeEventListener(AUTH_REQUIRED_EVENT, listener);
  });

  it('GETの401は従来どおりログイン画面へ遷移する', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      error: 'unauthenticated', loginUrl: 'https://door-fujita.com/contents/auth/login?redirect=x',
    }), { status: 401 })));

    void api.get('/customers');
    await vi.waitFor(() => expect(window.location.href).toContain('/contents/auth/login'));
  });

  it('401の後に書き込みが成功すると認証復旧イベントを通知する', async () => {
    const restored = vi.fn();
    window.addEventListener(AUTH_RESTORED_EVENT, restored);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'unauthenticated' }), { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 1 }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(api.post('/customers', {})).rejects.toMatchObject({ status: 401 });
    await api.post('/customers', {});
    expect(restored).toHaveBeenCalledOnce();
    window.removeEventListener(AUTH_RESTORED_EVENT, restored);
  });
});
