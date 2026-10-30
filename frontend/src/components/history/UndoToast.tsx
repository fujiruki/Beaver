import { useEffect } from 'react';

interface UndoToastProps {
  message: string;
  onUndo: () => void;
  onDismiss: () => void;
  pending?: boolean;
  autoDismissMs?: number;
}

/** R-0098: 削除直後に表示する「元に戻す」トースト。一定時間で自動的に消える */
export default function UndoToast({ message, onUndo, onDismiss, pending, autoDismissMs = 8000 }: UndoToastProps) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, autoDismissMs);
    return () => clearTimeout(timer);
  }, [onDismiss, autoDismissMs]);

  return (
    <div className="pd-undo" role="status">
      <span style={{ flex: 1 }}>{message}</span>
      <button onClick={onUndo} disabled={pending}>
        {pending ? '元に戻しています...' : '元に戻す'}
      </button>
      <button onClick={onDismiss} aria-label="閉じる">×</button>
    </div>
  );
}
