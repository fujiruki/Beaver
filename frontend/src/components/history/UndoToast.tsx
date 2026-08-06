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
    <div style={toastStyle} role="status">
      <span style={{ flex: 1 }}>{message}</span>
      <button onClick={onUndo} disabled={pending} style={undoBtnStyle}>
        {pending ? '元に戻しています...' : '元に戻す'}
      </button>
      <button onClick={onDismiss} style={closeBtnStyle} aria-label="閉じる">×</button>
    </div>
  );
}

const toastStyle: React.CSSProperties = {
  position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
  display: 'flex', alignItems: 'center', gap: 12,
  background: '#1e293b', color: '#fff', padding: '12px 16px', borderRadius: 8,
  boxShadow: '0 4px 16px rgba(0,0,0,0.25)', fontSize: 13, zIndex: 200, minWidth: 320,
};
const undoBtnStyle: React.CSSProperties = {
  padding: '4px 12px', background: '#2563eb', color: '#fff', border: 'none',
  borderRadius: 6, cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap',
};
const closeBtnStyle: React.CSSProperties = {
  background: 'transparent', border: 'none', color: '#94a3b8', fontSize: 16,
  cursor: 'pointer', lineHeight: 1,
};
