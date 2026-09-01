import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import FeedbackModal from '../FeedbackModal';

function renderModal() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <FeedbackModal />
    </QueryClientProvider>,
  );
}

function renderModalInsideNav() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <nav data-testid="nav">
        <FeedbackModal />
      </nav>
    </QueryClientProvider>,
  );
}

function makeImageFile(name: string): File {
  return new File(['dummy-image-bytes'], name, { type: 'image/png' });
}

function makeClipboardItem(file: File) {
  return {
    types: [file.type],
    getType: async () => file,
  } as unknown as ClipboardItem;
}

function stubClipboard(value: object) {
  Object.defineProperty(navigator, 'clipboard', { value, configurable: true });
}

describe('FeedbackModal (R-0080)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 201 })));
  });

  it('「改善要望を送る」ボタンからモーダルを開ける', async () => {
    const user = userEvent.setup();
    renderModal();

    expect(screen.queryByRole('dialog')).toBeNull();
    await user.click(screen.getByRole('button', { name: '改善要望を送る' }));
    expect(screen.getByRole('dialog')).not.toBeNull();
  });

  it('本文が空のまま送信するとエラーになりAPIは呼ばれない', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getByRole('button', { name: '改善要望を送る' }));

    await user.click(screen.getByRole('button', { name: '送信' }));

    expect(await screen.findByText('本文を入力してください')).not.toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('画像を選択するとプレビューが表示され、個別に削除できる', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getByRole('button', { name: '改善要望を送る' }));

    const fileInput = screen.getByTestId('feedback-image-input') as HTMLInputElement;
    await user.upload(fileInput, [makeImageFile('a.png'), makeImageFile('b.png')]);

    expect(await screen.findAllByRole('img')).toHaveLength(2);

    await user.click(screen.getAllByRole('button', { name: /削除/ })[0]);

    expect(await screen.findAllByRole('img')).toHaveLength(1);
  });

  it('5枚を超える画像を選択すると先頭5枚のみ保持しエラーを表示する', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getByRole('button', { name: '改善要望を送る' }));

    const fileInput = screen.getByTestId('feedback-image-input') as HTMLInputElement;
    const files = Array.from({ length: 6 }, (_, i) => makeImageFile(`img${i}.png`));
    await user.upload(fileInput, files);

    expect(await screen.findAllByRole('img')).toHaveLength(5);
    expect(await screen.findByText('画像は5枚まで添付できます')).not.toBeNull();
  });

  it('送信に成功するとモーダルを閉じ完了メッセージを表示する', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getByRole('button', { name: '改善要望を送る' }));

    await user.type(screen.getByPlaceholderText('不具合や改善してほしい点を入力してください'), 'ボタンが反応しません');
    await user.click(screen.getByRole('button', { name: '送信' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await screen.findByText(/送信しました/)).not.toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);

    const [, requestInit] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(requestInit.body).toBeInstanceOf(FormData);
    expect((requestInit.body as FormData).get('message')).toBe('ボタンが反応しません');
  });

  it('送信に失敗すると入力内容を保持しエラーを表示する', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":"ng"}', { status: 500 })));
    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getByRole('button', { name: '改善要望を送る' }));

    const textarea = screen.getByPlaceholderText('不具合や改善してほしい点を入力してください');
    await user.type(textarea, '送信できない');
    await user.click(screen.getByRole('button', { name: '送信' }));

    expect(await screen.findByText('送信に失敗しました。もう一度お試しください。')).not.toBeNull();
    expect(screen.getByRole('dialog')).not.toBeNull();
    expect((textarea as HTMLTextAreaElement).value).toBe('送信できない');
  });

  it('「📋 貼り付け」ボタンでクリップボードの画像が添付される', async () => {
    const user = userEvent.setup();
    stubClipboard({ read: vi.fn(async () => [makeClipboardItem(makeImageFile('clip.png'))]) });
    renderModal();
    await user.click(screen.getByRole('button', { name: '改善要望を送る' }));

    await user.click(screen.getByRole('button', { name: /貼り付け/ }));

    expect(await screen.findAllByRole('img')).toHaveLength(1);
  });

  it('クリップボードに画像がない場合はエラーを表示し既存の入力内容を保持する', async () => {
    const user = userEvent.setup();
    stubClipboard({ read: vi.fn(async () => []) });
    renderModal();
    await user.click(screen.getByRole('button', { name: '改善要望を送る' }));

    const textarea = screen.getByPlaceholderText('不具合や改善してほしい点を入力してください');
    await user.type(textarea, '保持されるべきテキスト');

    await user.click(screen.getByRole('button', { name: /貼り付け/ }));

    expect(await screen.findByText('クリップボードに画像がありません')).not.toBeNull();
    expect((textarea as HTMLTextAreaElement).value).toBe('保持されるべきテキスト');
  });

  it('clipboard.read が使えないブラウザではエラーを表示する', async () => {
    const user = userEvent.setup();
    stubClipboard({});
    renderModal();
    await user.click(screen.getByRole('button', { name: '改善要望を送る' }));

    await user.click(screen.getByRole('button', { name: /貼り付け/ }));

    expect(
      await screen.findByText('このブラウザではクリップボードからの貼り付けに対応していません'),
    ).not.toBeNull();
  });

  it('textareaへのCtrl+V貼り付けで画像ファイルが検出されると添付される', async () => {
    renderModal();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '改善要望を送る' }));

    const textarea = screen.getByPlaceholderText('不具合や改善してほしい点を入力してください');
    const file = makeImageFile('pasted.png');
    fireEvent.paste(textarea, {
      clipboardData: {
        items: [
          {
            kind: 'file',
            type: 'image/png',
            getAsFile: () => file,
          },
        ],
      },
    });

    expect(await screen.findAllByRole('img')).toHaveLength(1);
  });

  it('nav要素内に配置されていても、モーダルのオーバーレイはdocument.body直下に描画される（R-0134）', async () => {
    const user = userEvent.setup();
    renderModalInsideNav();

    const nav = screen.getByTestId('nav');
    await user.click(screen.getByRole('button', { name: '改善要望を送る' }));

    const dialog = screen.getByRole('dialog');
    expect(nav.contains(dialog)).toBe(false);
    expect(dialog.closest('[data-testid="nav"]')).toBeNull();
    expect(document.body.contains(dialog)).toBe(true);
  });

  it('モーダルを開くと本文入力欄に自動でフォーカスが当たる（R-0094）', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByRole('button', { name: '改善要望を送る' }));

    const textarea = screen.getByPlaceholderText('不具合や改善してほしい点を入力してください');
    await waitFor(() => expect(textarea).toBe(document.activeElement));
  });
});
