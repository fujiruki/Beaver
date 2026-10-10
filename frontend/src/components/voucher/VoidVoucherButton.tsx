import { useState } from 'react';
import { api } from '../../api/client';
import { useVoidVoucher } from '../../api/vouchers';
import type { Voucher } from '../../types/voucher';

interface Props {
  voucherId: number;
  blockReason?: string | null;
  beforeVoid?: () => Promise<boolean>;
  onDone: () => void;
  performVoid?: (reason?: string) => Promise<void>;
  style?: React.CSSProperties;
}

/** R-0154: 伝票の取消ボタン。空の伝票は確認なしで即実行、中身ありは理由（任意）を聞く */
export default function VoidVoucherButton({ voucherId, blockReason, beforeVoid, onDone, performVoid, style }: Props) {
  const voidMutation = useVoidVoucher();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [checking, setChecking] = useState(false);

  const run = async (r?: string) => {
    try {
      if (performVoid) await performVoid(r);
      else await voidMutation.mutateAsync({ id: voucherId, reason: r });
      setDialogOpen(false);
      onDone();
    } catch (e) {
      alert(`取消できませんでした: ${(e as Error).message}`);
    }
  };

  const handleClick = async () => {
    setChecking(true);
    try {
      if (beforeVoid && !(await beforeVoid())) return;
      const v = await api.get<Voucher>(`/vouchers/${voucherId}`);
      if (v.is_empty) {
        await run();
      } else {
        setReason('');
        setDialogOpen(true);
      }
    } catch (e) {
      alert(`取消できませんでした: ${(e as Error).message}`);
    } finally {
      setChecking(false);
    }
  };

  const busy = checking || voidMutation.isPending;

  return (
    <>
      <button type="button" onClick={handleClick} disabled={!!blockReason || busy} title={blockReason ?? undefined}
        style={{ ...btnStyle, ...style, ...(blockReason ? blockedBtnStyle : {}) }}>
        {busy ? '取消中...' : '取消'}
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
            <label style={{ display: 'block', marginBottom: 8, fontSize: 14, color: '#334155' }}>
              この伝票を取り消します。理由（任意）
            </label>
            <input type="text" value={reason} onChange={e => setReason(e.target.value)} autoFocus
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
              <button type="button" onClick={() => setDialogOpen(false)} style={cancelBtnStyle}>
                やめる
              </button>
              <button type="button" onClick={() => run(reason)} disabled={voidMutation.isPending} style={confirmBtnStyle}>
                {voidMutation.isPending ? '取消中...' : '取り消す'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const btnStyle: React.CSSProperties = {
  padding: '6px 14px', background: '#fff', color: '#dc2626',
  border: '1px solid #fca5a5', borderRadius: 6, cursor: 'pointer', fontSize: 13,
};
const cancelBtnStyle: React.CSSProperties = {
  padding: '8px 20px', background: '#f1f5f9', color: '#475569',
  border: '1px solid #cbd5e1', borderRadius: 6, cursor: 'pointer', fontSize: 14,
};
const confirmBtnStyle: React.CSSProperties = {
  padding: '8px 24px', background: '#dc2626', color: '#fff',
  border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14, fontWeight: 'bold',
};
const blockedBtnStyle: React.CSSProperties = {
  background: '#f1f5f9', color: '#94a3b8', borderColor: '#e2e8f0', cursor: 'not-allowed',
};
