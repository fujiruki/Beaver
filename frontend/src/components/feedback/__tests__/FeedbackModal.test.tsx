import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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

function makeImageFile(name: string): File {
  return new File(['dummy-image-bytes'], name, { type: 'image/png' });
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
});
