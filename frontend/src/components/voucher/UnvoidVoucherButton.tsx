import { useState } from 'react';

interface Props {
  performUnvoid: (reason: string) => Promise<void>;
}

const LABEL = 'この伝票を下書きに戻します。理由（任意）';

/** R-0170: 取消（void）した伝票を下書きに戻すボタン。確認ダイアログで理由（任意）を聞く */
export default function UnvoidVoucherButton({ performUnvoid }: Props) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      await performUnvoid(reason);
      setDialogOpen(false);
    } catch (e) {
      alert(`下書きに戻せませんでした: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" onClick={() => { setReason(''); setDialogOpen(true); }} style={btnStyle}>
        下書きに戻す
      </button>
      {dialogOpen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 200,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.4)', padding: 24,
        }}>
          <div style={{
            background: '#fff', borderRadius: 10, padding: 28, width: '100%', maxWidth: 480,
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          }}>
            <label htmlFor="unvoid-reason" style={{ display: 'block', marginBottom: 8, fontSize: 14, color: '#334155' }}>
              {LABEL}
            </label>
            <input id="unvoid-reason" type="text" value={reason} onChange={e => setReason(e.target.value)} autoFocus
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
              <button type="button" onClick={() => setDialogOpen(false)} style={cancelBtnStyle}>
                やめる
              </button>
              <button type="button" onClick={() => void run()} disabled={busy} style={confirmBtnStyle}>
                {busy ? '処理中...' : '戻す'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const btnStyle: React.CSSProperties = {
  padding: '6px 14px', background: '#fff', color: '#2563eb',
  border: '1px solid #93c5fd', borderRadius: 6, cursor: 'pointer', fontSize: 13,
};
const cancelBtnStyle: React.CSSProperties = {
  padding: '8px 20px', background: '#f1f5f9', color: '#475569',
  border: '1px solid #cbd5e1', borderRadius: 6, cursor: 'pointer', fontSize: 14,
};
const confirmBtnStyle: React.CSSProperties = {
  padding: '8px 24px', background: '#2563eb', color: '#fff',
  border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14, fontWeight: 'bold',
};
