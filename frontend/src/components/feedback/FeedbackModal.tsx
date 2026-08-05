import { useEffect, useMemo, useRef, useState } from 'react';
import { useSubmitFeedback } from '../../api/feedback';

const MAX_IMAGES = 5;

export default function FeedbackModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [images, setImages] = useState<File[]>([]);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const submitMutation = useSubmitFeedback();

  const previews = useMemo(() => images.map((file) => URL.createObjectURL(file)), [images]);
  useEffect(() => {
    return () => {
      previews.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [previews]);

  function openModal() {
    setIsOpen(true);
    setValidationError(null);
  }

  function closeModal() {
    setIsOpen(false);
    setMessage('');
    setImages([]);
    setValidationError(null);
    submitMutation.reset();
  }

  function addImages(newFiles: File[]) {
    const merged = [...images, ...newFiles];
    if (merged.length > MAX_IMAGES) {
      setValidationError(`画像は${MAX_IMAGES}枚まで添付できます`);
    }
    setImages(merged.slice(0, MAX_IMAGES));
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    addImages(selected);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function removeImage(index: number) {
    setImages((current) => current.filter((_, i) => i !== index));
  }

  async function handlePasteFromClipboard() {
    if (!navigator.clipboard?.read) {
      setValidationError('このブラウザではクリップボードからの貼り付けに対応していません');
      return;
    }
    try {
      const clipboardItems = await navigator.clipboard.read();
      const imageFiles: File[] = [];
      for (const item of clipboardItems) {
        const imageType = item.types.find((type) => type.startsWith('image/'));
        if (imageType) {
          const blob = await item.getType(imageType);
          const ext = imageType.split('/')[1] ?? 'png';
          imageFiles.push(new File([blob], `clipboard-${Date.now()}.${ext}`, { type: imageType }));
        }
      }
      if (imageFiles.length === 0) {
        setValidationError('クリップボードに画像がありません');
        return;
      }
      addImages(imageFiles);
    } catch {
      setValidationError('クリップボードの読み取りに失敗しました');
    }
  }

  function handleTextareaPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const items = Array.from(e.clipboardData?.items ?? []);
    const imageFiles = items
      .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null);
    if (imageFiles.length > 0) {
      e.preventDefault();
      addImages(imageFiles);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = message.trim();
    if (trimmed === '') {
      setValidationError('本文を入力してください');
      return;
    }
    setValidationError(null);
    try {
      await submitMutation.mutateAsync({
        message: trimmed,
        pagePath: window.location.pathname,
        images,
      });
      setIsOpen(false);
      setMessage('');
      setImages([]);
      setShowCompleted(true);
      setTimeout(() => setShowCompleted(false), 4000);
    } catch {
      // エラー表示は submitMutation.isError 側で行う。入力内容は保持する。
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className="px-3 py-2 text-sm bg-blue-50 border border-blue-300 text-blue-700 rounded hover:bg-blue-100"
      >
        改善要望を送る
      </button>

      {showCompleted && (
        <div className="fixed bottom-4 right-4 z-50 px-4 py-3 bg-green-50 border border-green-300 text-green-700 text-sm rounded shadow">
          送信しました。ご協力ありがとうございます。
        </div>
      )}

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6">
          <div role="dialog" aria-modal="true" aria-label="改善要望を送る" className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6">
            <h2 className="text-base font-bold text-slate-900 mb-4">改善要望を送る</h2>

            {submitMutation.isError && (
              <div className="mb-3 px-3 py-2 bg-red-50 text-red-600 text-sm rounded">
                送信に失敗しました。もう一度お試しください。
              </div>
            )}
            {validationError && (
              <div className="mb-3 px-3 py-2 bg-red-50 text-red-600 text-sm rounded">
                {validationError}
              </div>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onPaste={handleTextareaPaste}
                rows={5}
                placeholder="不具合や改善してほしい点を入力してください"
                className="w-full border border-slate-300 rounded px-3 py-2 text-sm text-slate-900"
              />

              <div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1 text-xs bg-blue-50 border border-blue-300 text-blue-700 rounded hover:bg-blue-100"
                >
                  ＋ 画像を追加
                </button>
                <button
                  type="button"
                  onClick={handlePasteFromClipboard}
                  className="ml-2 px-3 py-1 text-xs bg-blue-50 border border-blue-300 text-blue-700 rounded hover:bg-blue-100"
                >
                  📋 貼り付け
                </button>
                <input
                  ref={fileInputRef}
                  data-testid="feedback-image-input"
                  type="file"
                  multiple
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileChange}
                />

                {images.length > 0 && (
                  <div className="flex flex-wrap gap-3 mt-3">
                    {images.map((file, index) => (
                      <div key={`${file.name}-${index}`} className="relative group">
                        <img
                          src={previews[index]}
                          alt={file.name}
                          className="w-20 h-20 object-cover rounded border border-slate-200"
                        />
                        <button
                          type="button"
                          onClick={() => removeImage(index)}
                          aria-label={`${file.name}を削除`}
                          className="absolute top-1 right-1 w-5 h-5 bg-red-600 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 mt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 text-sm bg-slate-100 border border-slate-300 text-slate-700 rounded"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={submitMutation.isPending}
                  className="px-5 py-2 text-sm bg-blue-600 text-white rounded"
                >
                  {submitMutation.isPending ? '送信中...' : '送信'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
