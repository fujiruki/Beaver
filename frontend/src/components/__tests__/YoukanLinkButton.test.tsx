import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import YoukanLinkButton from '../YoukanLinkButton';

function stubFetch(body: unknown) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('YoukanLinkButton (R-0130)', () => {
  it('ok:true応答時、window.openが正しいURLで新規タブとして呼ばれる', async () => {
    stubFetch({ ok: true, url: 'https://door-fujita.com/contents/Youkan/Focus?projectId=abc' });
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    render(<YoukanLinkButton projectId={5} />);
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => expect(openSpy).toHaveBeenCalledWith(
      'https://door-fujita.com/contents/Youkan/Focus?projectId=abc',
      '_blank',
      'noopener,noreferrer',
    ));
  });

  it('ok:false応答時、window.openが呼ばれずメッセージが表示される', async () => {
    stubFetch({ ok: false, reason: 'not_found', message: 'この案件はまだYoukanと連携されていません' });
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    render(<YoukanLinkButton projectId={5} />);
    fireEvent.click(screen.getByRole('button'));

    await screen.findByText('この案件はまだYoukanと連携されていません');
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('通信自体が失敗した場合、window.openが呼ばれず既定メッセージが表示される', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network error'); }));
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    render(<YoukanLinkButton projectId={5} />);
    fireEvent.click(screen.getByRole('button'));

    await screen.findByText('Youkanに接続できませんでした');
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('親要素のクリックへ伝播しない', async () => {
    stubFetch({ ok: true, url: 'https://example.com/x' });
    vi.spyOn(window, 'open').mockImplementation(() => null);
    const parentClick = vi.fn();

    render(
      <div onClick={parentClick}>
        <YoukanLinkButton projectId={5} />
      </div>,
    );
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => expect(window.fetch).toHaveBeenCalled());
    expect(parentClick).not.toHaveBeenCalled();
  });
});
