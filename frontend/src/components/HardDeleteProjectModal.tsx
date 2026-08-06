interface Props {
  isOpen: boolean;
  isPending: boolean;
  errorMessage: string | null;
  onClose: () => void;
  onConfirm: () => void;
}

/** R-0095: 案件の完全削除を実行する前に表示する赤系の警告付き確認モーダル */
export default function HardDeleteProjectModal({ isOpen, isPending, errorMessage, onClose, onConfirm }: Props) {
  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.4)', padding: 24,
    }}>
      <div style={{
        background: '#fff', borderRadius: 10, padding: 28, width: '100%', maxWidth: 480,
        boxShadow: '0 8px 32px rgba(0,0,0,0.2)', border: '2px solid #dc2626',
      }}>
        <h2 style={{ margin: '0 0 16px', fontSize: 17, fontWeight: 'bold', color: '#dc2626' }}>
          案件の完全削除
        </h2>

        <div style={{
          marginBottom: 16, padding: '12px 14px', background: '#fee2e2', color: '#991b1b',
          borderRadius: 6, fontSize: 13, fontWeight: 'bold', lineHeight: 1.6,
        }}>
          この操作は取り消せません。案件に紐づく伝票・明細も全て完全に削除されます。
        </div>

        {errorMessage && (
          <div style={{ marginBottom: 16, padding: '10px 12px', background: '#fef2f2', color: '#b91c1c', borderRadius: 6, fontSize: 13 }}>
            {errorMessage}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" onClick={onClose} style={cancelBtnStyle}>
            キャンセル
          </button>
          <button type="button" onClick={onConfirm} disabled={isPending} style={confirmBtnStyle}>
            {isPending ? '削除中...' : '完全に削除する'}
          </button>
        </div>
      </div>
    </div>
  );
}

const cancelBtnStyle: React.CSSProperties = {
  padding: '8px 20px', background: '#f1f5f9', color: '#475569',
  border: '1px solid #cbd5e1', borderRadius: 6, cursor: 'pointer', fontSize: 14,
};
const confirmBtnStyle: React.CSSProperties = {
  padding: '8px 24px', background: '#dc2626', color: '#fff',
  border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14, fontWeight: 'bold',
};
