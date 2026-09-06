import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useInvoice, useCreateInvoice, useDeleteInvoice } from '../api/invoices';
import { useCreatePayment, useDeletePayment } from '../api/payments';
import { useCustomers } from '../api/customers';
import { useVouchers } from '../api/vouchers';
import { useRestoreHistory } from '../api/history';
import { useBillingEditEnabled } from '../api/settings';
import HistoryDrawer from '../components/history/HistoryDrawer';
import UndoToast from '../components/history/UndoToast';
import { useSmartBack } from '../hooks/useSmartBack';
import type { Payment, InvoiceInput, PaymentInput } from '../types/invoice';

export default function InvoiceDetail() {
  const goBack = useSmartBack('/invoices');
  const { id } = useParams<{ id: string }>();
  const invoiceId = id ? Number(id) : 0;
  const isNew = !id;

  const { data: invoice, isLoading } = useInvoice(invoiceId);
  const { data: customers = [] } = useCustomers();
  const { data: billedVouchers = [] } = useVouchers({ status: 'approved' });

  const createMutation = useCreateInvoice();
  const deleteMutation = useDeleteInvoice();
  const createPaymentMutation = useCreatePayment();
  const deletePaymentMutation = useDeletePayment();
  const restoreMutation = useRestoreHistory();
  const { data: billingEditSetting } = useBillingEditEnabled();
  const billingEditEnabled = billingEditSetting?.billing_edit_enabled ?? false;

  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [showPaymentHistory, setShowPaymentHistory] = useState(false);
  const [paymentToast, setPaymentToast] = useState<{ message: string; historyId: number | null } | null>(null);
  const [deleteToast, setDeleteToast] = useState<{ message: string; historyId: number | null } | null>(null);
  const deleteGoBack = useSmartBack('/invoices', deleteToast ? { toast: deleteToast } : undefined);

  useEffect(() => {
    if (deleteToast) {
      deleteGoBack();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deleteToast]);

  const { register, handleSubmit, watch, formState: { errors } } = useForm<InvoiceInput>({
    defaultValues: {
      customer_id: 0,
      invoice_date: new Date().toISOString().split('T')[0],
      cutoff_date: new Date().toISOString().split('T')[0],
      billing_date: new Date().toISOString().split('T')[0],
      carry_forward: 0,
      sales_total: 0,
      tax_total: 0,
      payment_received: 0,
      invoice_total: 0,
      next_carry_forward: 0,
      voucher_ids: [],
    },
  });

  const payForm = useForm<PaymentInput>({
    defaultValues: {
      customer_id: invoice?.customer_id ?? 0,
      invoice_id: invoiceId,
      payment_date: new Date().toISOString().split('T')[0],
      amount: 0,
      payment_type: '振込',
      memo: null,
    },
  });

  async function onSubmit(data: InvoiceInput) {
    await createMutation.mutateAsync(data);
    goBack();
  }

  async function onPaymentSubmit(data: PaymentInput) {
    await createPaymentMutation.mutateAsync({
      ...data,
      customer_id: invoice?.customer_id ?? data.customer_id,
      invoice_id: invoiceId,
    });
    setShowPaymentForm(false);
    payForm.reset();
  }

  async function handleDelete() {
    if (!window.confirm('この請求書を削除しますか？（入金記録がある場合は削除できません）')) return;
    try {
      const result = await deleteMutation.mutateAsync(invoiceId);
      setDeleteToast({ message: `請求書 ${invoice?.invoice_no ?? ''} を削除しました`, historyId: result.history_id });
    } catch (e) {
      alert(String(e));
    }
  }

  async function handleDeletePayment(p: Payment) {
    if (!window.confirm('この入金記録を取り消しますか？')) return;
    const result = await deletePaymentMutation.mutateAsync(p.id);
    setPaymentToast({ message: `入金 ${p.payment_no} を削除しました`, historyId: result.history_id });
  }

  async function handleUndoPaymentDelete() {
    if (!paymentToast?.historyId) return;
    await restoreMutation.mutateAsync(paymentToast.historyId);
    setPaymentToast(null);
  }

  const watchedCustomerId = watch('customer_id');
  const filteredVouchers = billedVouchers.filter(v =>
    v.customer_id === Number(watchedCustomerId)
  );

  if (!isNew && isLoading) return <div>読み込み中...</div>;

  return (
    <div style={{ maxWidth: 860 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button onClick={goBack} style={backBtnStyle}>← 戻る</button>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 'bold' }}>
          {isNew ? '請求書 新規作成' : `請求書 ${invoice?.invoice_no ?? ''}`}
        </h1>
        {!isNew && invoice?.access_cancelled_at && (
          <span style={cancelledBadgeStyle}>取消済み</span>
        )}
        {!isNew && billingEditEnabled && (
          <button onClick={handleDelete} disabled={deleteMutation.isPending}
            style={{ ...backBtnStyle, color: '#dc2626', borderColor: '#fca5a5', marginLeft: 'auto' }}>
            削除
          </button>
        )}
      </div>

      {isNew && !billingEditEnabled ? (
        <div style={cardStyle}>
          請求書の新規作成は現在停止しています（Access側の写しとして表示専用です）。
        </div>
      ) : isNew ? (
        /* 新規作成フォーム */
        <form onSubmit={handleSubmit(onSubmit)}>
          <div style={cardStyle}>
            <h2 style={sectionTitle}>請求書情報</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
              <Field label="得意先 *" error={errors.customer_id?.message}>
                <select {...register('customer_id', { valueAsNumber: true, required: '必須です' })} style={inputStyle}>
                  <option value={0}>-- 選択してください --</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
              <Field label="請求日 *" error={errors.billing_date?.message}>
                <input type="date" {...register('billing_date', { required: '必須です' })} style={inputStyle} />
              </Field>
              <Field label="発行日">
                <input type="date" {...register('invoice_date')} style={inputStyle} />
              </Field>
              <Field label="締め日">
                <input type="date" {...register('cutoff_date')} style={inputStyle} />
              </Field>
              <Field label="前月繰越">
                <input type="number" {...register('carry_forward', { valueAsNumber: true })} style={inputStyle} />
              </Field>
              <Field label="入金額">
                <input type="number" {...register('payment_received', { valueAsNumber: true })} style={inputStyle} />
              </Field>
              <Field label="売上合計 *">
                <input type="number" {...register('sales_total', { valueAsNumber: true })} style={inputStyle} />
              </Field>
              <Field label="消費税合計 *">
                <input type="number" {...register('tax_total', { valueAsNumber: true })} style={inputStyle} />
              </Field>
              <Field label="請求合計 *">
                <input type="number" {...register('invoice_total', { valueAsNumber: true })} style={inputStyle} />
              </Field>
              <Field label="次月繰越">
                <input type="number" {...register('next_carry_forward', { valueAsNumber: true })} style={inputStyle} />
              </Field>
            </div>
          </div>

          {/* 紐づける伝票 */}
          {filteredVouchers.length > 0 && (
            <div style={{ ...cardStyle, marginTop: 16 }}>
              <h2 style={sectionTitle}>紐づける承認済み伝票</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {filteredVouchers.map(v => (
                  <label key={v.id} style={{ display: 'flex', gap: 10, alignItems: 'center',
                    padding: '8px 10px', background: '#f8fafc', borderRadius: 6, cursor: 'pointer' }}>
                    <input type="checkbox" value={v.id}
                      {...register('voucher_ids')}
                      style={{ width: 16, height: 16 }} />
                    <span style={{ fontSize: 13 }}>
                      {v.voucher_no} / {v.voucher_date} / ¥{v.total_amount.toLocaleString()}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginTop: 20, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={goBack} style={cancelBtnStyle}>
              キャンセル
            </button>
            <button type="submit" disabled={createMutation.isPending} style={submitBtnStyle}>
              {createMutation.isPending ? '作成中...' : '作成'}
            </button>
          </div>
        </form>
      ) : (
        /* 詳細表示 */
        <>
          <div style={cardStyle}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              <InfoRow label="得意先" value={invoice?.billing_name_print ?? invoice?.customer_name ?? '-'} />
              <InfoRow label="請求日" value={invoice?.billing_date ?? '-'} />
              <InfoRow label="締め日" value={invoice?.cutoff_date ?? '-'} />
              <InfoRow label="発行日" value={invoice?.invoice_date ?? '-'} />
              <InfoRow label="前月繰越" value={`¥${(invoice?.carry_forward ?? 0).toLocaleString()}`} />
              <InfoRow label="入金済" value={`¥${(invoice?.payment_received ?? 0).toLocaleString()}`} />
              <InfoRow label="売上合計" value={`¥${(invoice?.sales_total ?? 0).toLocaleString()}`} />
              <InfoRow label="消費税" value={`¥${(invoice?.tax_total ?? 0).toLocaleString()}`} />
              <InfoRow label="請求合計" value={`¥${(invoice?.invoice_total ?? 0).toLocaleString()}`} bold />
              <InfoRow label="次月繰越" value={`¥${(invoice?.next_carry_forward ?? 0).toLocaleString()}`}
                color={(invoice?.next_carry_forward ?? 0) > 0 ? '#f59e0b' : undefined} />
            </div>
          </div>

          {/* 紐づく売上伝票 */}
          {(invoice?.vouchers ?? []).length > 0 && (
            <div style={{ ...cardStyle, marginTop: 16 }}>
              <h2 style={sectionTitle}>紐づく売上伝票</h2>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    <Th>伝票番号</Th><Th>伝票日付</Th><Th right>金額</Th><Th>備考</Th>
                  </tr>
                </thead>
                <tbody>
                  {invoice?.vouchers?.map(v => (
                    <tr key={v.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                      <Td>{v.voucher_no}</Td>
                      <Td>{v.voucher_date}</Td>
                      <Td right>¥{v.total_amount.toLocaleString()}</Td>
                      <Td>{v.memo ?? ''}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 入金履歴 */}
          <div style={{ ...cardStyle, marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h2 style={{ ...sectionTitle, margin: 0 }}>入金履歴</h2>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setShowPaymentHistory(true)} style={backBtnStyle}>
                  削除履歴
                </button>
                {billingEditEnabled && (
                  <button onClick={() => setShowPaymentForm(v => !v)} style={addPayBtnStyle}>
                    {showPaymentForm ? 'キャンセル' : '+ 入金登録'}
                  </button>
                )}
              </div>
            </div>

            {billingEditEnabled && showPaymentForm && (
              <form onSubmit={payForm.handleSubmit(onPaymentSubmit)}
                style={{ background: '#f0f9ff', padding: 16, borderRadius: 8, marginBottom: 16 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                  <Field label="入金日">
                    <input type="date" {...payForm.register('payment_date')} style={inputStyle} />
                  </Field>
                  <Field label="金額 *">
                    <input type="number" {...payForm.register('amount', { valueAsNumber: true })} style={inputStyle} />
                  </Field>
                  <Field label="入金種別">
                    <select {...payForm.register('payment_type')} style={inputStyle}>
                      <option>振込</option>
                      <option>現金</option>
                      <option>小切手</option>
                      <option>手形</option>
                      <option>相殺</option>
                    </select>
                  </Field>
                  <Field label="備考">
                    <input {...payForm.register('memo')} style={inputStyle} />
                  </Field>
                </div>
                <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
                  <button type="submit" disabled={createPaymentMutation.isPending} style={submitBtnStyle}>
                    {createPaymentMutation.isPending ? '登録中...' : '入金登録'}
                  </button>
                </div>
              </form>
            )}

            {(invoice?.payments ?? []).length === 0 ? (
              <div style={{ padding: '16px 0', color: '#94a3b8', fontSize: 13 }}>入金記録なし</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    <Th>入金番号</Th><Th>入金日</Th><Th>種別</Th><Th right>金額</Th><Th>備考</Th><Th></Th>
                  </tr>
                </thead>
                <tbody>
                  {invoice?.payments?.map(p => (
                    <tr key={p.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                      <Td>{p.payment_no}</Td>
                      <Td>{p.payment_date}</Td>
                      <Td>{p.payment_type}</Td>
                      <Td right color="#10b981">¥{p.amount.toLocaleString()}</Td>
                      <Td>{p.memo ?? ''}</Td>
                      <Td>
                        {billingEditEnabled && (
                          <button onClick={() => handleDeletePayment(p)}
                            style={{ ...backBtnStyle, fontSize: 12, color: '#ef4444', borderColor: '#fca5a5' }}>
                            取消
                          </button>
                        )}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      <HistoryDrawer
        open={showPaymentHistory}
        onClose={() => setShowPaymentHistory(false)}
        entity="payments"
        title="入金の削除履歴"
      />

      {paymentToast && (
        <UndoToast
          message={paymentToast.message}
          pending={restoreMutation.isPending}
          onUndo={handleUndoPaymentDelete}
          onDismiss={() => setPaymentToast(null)}
        />
      )}
    </div>
  );
}

function Field({ label, error, children }: {
  label: string; error?: string; children: React.ReactNode;
}) {
  return (
    <div>
      <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 'bold', color: '#475569' }}>
        {label}
      </label>
      {children}
      {error && <p style={{ margin: '4px 0 0', fontSize: 12, color: '#dc2626' }}>{error}</p>}
    </div>
  );
}

function InfoRow({ label, value, bold, color }: { label: string; value: string; bold?: boolean; color?: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: bold ? 'bold' : 'normal', color: color ?? '#1e293b' }}>{value}</div>
    </div>
  );
}

function Th({ children, right }: { children?: React.ReactNode; right?: boolean }) {
  return (
    <th style={{ padding: '8px 10px', textAlign: right ? 'right' : 'left', fontSize: 12,
      color: '#64748b', fontWeight: 'bold', borderBottom: '1px solid #e2e8f0' }}>
      {children}
    </th>
  );
}

function Td({ children, right, color }: { children?: React.ReactNode; right?: boolean; color?: string }) {
  return (
    <td style={{ padding: '8px 10px', textAlign: right ? 'right' : 'left', color: color ?? '#1e293b' }}>
      {children}
    </td>
  );
}

const cardStyle: React.CSSProperties = {
  background: '#fff', borderRadius: 8, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
};
const sectionTitle: React.CSSProperties = {
  margin: '0 0 14px', fontSize: 14, fontWeight: 'bold', color: '#475569',
};
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '7px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 14, boxSizing: 'border-box',
};
const backBtnStyle: React.CSSProperties = {
  padding: '4px 10px', background: 'transparent', border: '1px solid #cbd5e1',
  borderRadius: 6, cursor: 'pointer', fontSize: 13, color: '#475569',
};
const cancelBtnStyle: React.CSSProperties = {
  padding: '8px 20px', background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1',
  borderRadius: 6, cursor: 'pointer', fontSize: 14,
};
const submitBtnStyle: React.CSSProperties = {
  padding: '8px 24px', background: '#2563eb', color: '#fff', border: 'none',
  borderRadius: 6, cursor: 'pointer', fontSize: 14,
};
const addPayBtnStyle: React.CSSProperties = {
  padding: '5px 14px', background: '#10b981', color: '#fff', border: 'none',
  borderRadius: 6, cursor: 'pointer', fontSize: 13,
};
const cancelledBadgeStyle: React.CSSProperties = {
  padding: '2px 10px', background: '#fee2e2', color: '#dc2626', borderRadius: 999,
  fontSize: 12, fontWeight: 'bold',
};
