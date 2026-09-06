import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useCustomer, useUpdateCarryForward } from '../api/customers';
import { useBillingEditEnabled } from '../api/settings';
import { useSmartBack } from '../hooks/useSmartBack';

export default function CarryForwardEdit() {
  const { id } = useParams<{ id: string }>();
  const customerId = Number(id);
  const goBack = useSmartBack(`/customers/${id}`);

  const { data: customer, isLoading } = useCustomer(customerId);
  const mutation = useUpdateCarryForward(customerId);
  const { data: billingEditSetting } = useBillingEditEnabled();
  const billingEditEnabled = billingEditSetting?.billing_edit_enabled ?? false;

  const [balance, setBalance] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  if (isLoading) return <div>読み込み中...</div>;
  if (!customer) return <div>得意先が見つかりません</div>;
  if (!billingEditEnabled) {
    return (
      <div style={{ maxWidth: 560 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <button onClick={goBack} style={backBtnStyle}>← 戻る</button>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 'bold' }}>繰越残高 修正</h1>
        </div>
        <div style={{ background: '#fff', padding: 24, borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          繰越残高の手動修正は現在停止しています（Access側の写しとして表示専用です）。
        </div>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await mutation.mutateAsync(Number(balance));
    goBack();
  }

  return (
    <div style={{ maxWidth: 560 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button onClick={goBack} style={backBtnStyle}>← 戻る</button>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 'bold' }}>繰越残高 修正</h1>
      </div>

      <div style={{ marginBottom: 20, padding: '14px 16px', background: '#fef9c3', border: '1px solid #fbbf24', borderRadius: 8 }}>
        <p style={{ margin: '0 0 6px', fontWeight: 'bold', fontSize: 14, color: '#92400e' }}>⚠ これは例外処理です</p>
        <p style={{ margin: 0, fontSize: 13, color: '#78350f', lineHeight: 1.6 }}>
          繰越残高は通常、請求締め処理によって自動更新されます。<br />
          この画面での手動変更は、移行データの修正など特別な事情がある場合のみ行ってください。<br />
          誤った値を入力すると売掛残高との整合性が崩れます。
        </p>
      </div>

      <div style={{ background: '#fff', padding: 24, borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <p style={{ margin: '0 0 16px', fontSize: 14, color: '#475569' }}>
          得意先: <strong>{customer.name}</strong>（現在の繰越残高: ¥{customer.carry_forward_balance.toLocaleString()}）
        </p>

        <form onSubmit={handleSubmit}>
          <label style={labelStyle}>新しい繰越残高</label>
          <input
            type="number"
            value={balance}
            onChange={e => setBalance(e.target.value)}
            placeholder={String(customer.carry_forward_balance)}
            required
            style={{ ...inputStyle, marginBottom: 20 }}
          />

          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 24, cursor: 'pointer', fontSize: 13, color: '#334155' }}>
            <input
              type="checkbox"
              checked={confirmed}
              onChange={e => setConfirmed(e.target.checked)}
              style={{ marginTop: 2, flexShrink: 0 }}
            />
            上記の注意事項を理解した上で、手動修正が必要な正当な理由があることを確認しました。
          </label>

          {mutation.error && (
            <p style={{ margin: '0 0 12px', fontSize: 13, color: '#dc2626' }}>
              保存に失敗しました: {String(mutation.error)}
            </p>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={goBack} style={cancelBtnStyle}>
              キャンセル
            </button>
            <button
              type="submit"
              disabled={!confirmed || mutation.isPending}
              style={{ ...submitBtnStyle, opacity: (!confirmed || mutation.isPending) ? 0.5 : 1 }}
            >
              {mutation.isPending ? '保存中...' : '修正を保存'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 'bold', color: '#475569',
};
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '7px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 14, boxSizing: 'border-box',
};
const backBtnStyle: React.CSSProperties = {
  padding: '4px 10px', background: 'transparent', border: '1px solid #cbd5e1', borderRadius: 6, cursor: 'pointer', fontSize: 13, color: '#475569',
};
const cancelBtnStyle: React.CSSProperties = {
  padding: '8px 20px', background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', borderRadius: 6, cursor: 'pointer', fontSize: 14,
};
const submitBtnStyle: React.CSSProperties = {
  padding: '8px 24px', background: '#d97706', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14,
};
