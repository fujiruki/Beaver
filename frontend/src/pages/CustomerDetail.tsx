import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useCustomer, useCreateCustomer, useUpdateCustomer } from '../api/customers';
import { useBillingEditEnabled } from '../api/settings';
import CustomerFormFields from '../components/CustomerFormFields';
import HistoryDrawer from '../components/history/HistoryDrawer';
import { useSmartBack } from '../hooks/useSmartBack';
import type { CustomerInput } from '../types/customer';
import type { Customer } from '../types/customer';
import { ApiError } from '../api/client';

export default function CustomerDetail() {
  const navigate = useNavigate();
  const goBack = useSmartBack('/customers');
  const { id } = useParams<{ id: string }>();
  const customerId = id ? Number(id) : 0;
  const isNew = !id;

  const { data: customer, isLoading, refetch } = useCustomer(customerId);
  const createMutation = useCreateCustomer();
  const updateMutation = useUpdateCustomer(customerId);
  const { data: billingEditSetting } = useBillingEditEnabled();
  const billingEditEnabled = billingEditSetting?.billing_edit_enabled ?? false;
  const [showHistory, setShowHistory] = useState(false);
  const initializedRef = useRef(false);
  const expectedUpdatedAtRef = useRef<string | null>(null);
  const [staleCustomer, setStaleCustomer] = useState<Customer | null>(null);

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<CustomerInput>({
    defaultValues: {
      honorific_type: '御中',
      cutoff_day: 31,
      billing_offset_days: 15,
      payment_due_days: 30,
      billing_date_print: 0,
      is_active: 1,
    },
  });

  useEffect(() => {
    if (customer && !initializedRef.current) {
      reset({
        ...customer,
        cutoff_day: customer.cutoff_day === 0 ? 31 : customer.cutoff_day,
      });
      expectedUpdatedAtRef.current = customer.updated_at;
      initializedRef.current = true;
    }
  }, [customer, reset]);

  async function onSubmit(data: CustomerInput) {
    if (isNew) {
      await createMutation.mutateAsync(data);
    } else {
      try {
        await updateMutation.mutateAsync({
          ...data,
          expected_updated_at: expectedUpdatedAtRef.current ?? undefined,
        });
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) {
          const body = error.body as { error?: string; customer?: Customer };
          if (body.error === 'stale_customer' && body.customer) {
            setStaleCustomer(body.customer);
            return;
          }
        }
        return;
      }
    }
    goBack();
  }

  async function reloadCustomer() {
    const result = await refetch();
    const latest = result.data ?? staleCustomer;
    if (!latest) return;
    reset({ ...latest, cutoff_day: latest.cutoff_day === 0 ? 31 : latest.cutoff_day });
    expectedUpdatedAtRef.current = latest.updated_at;
    setStaleCustomer(null);
  }

  if (!isNew && isLoading) return <div>読み込み中...</div>;

  const isPending = createMutation.isPending || updateMutation.isPending;
  const mutError  = createMutation.error || updateMutation.error;

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button onClick={goBack} style={backBtnStyle}>← 戻る</button>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 'bold' }}>
          {isNew ? '得意先 新規登録' : '得意先 編集'}
        </h1>
        {/* R-0143 A-B-06: 同期バッジ */}
        {!isNew && (
          <span style={{
            fontSize: 11, padding: '2px 8px', borderRadius: 4,
            background: customer?.access_customer_no != null ? '#eff6ff' : '#f0fdf4',
            color: customer?.access_customer_no != null ? '#1e40af' : '#166534',
            border: `1px solid ${customer?.access_customer_no != null ? '#bfdbfe' : '#bbf7d0'}`,
          }}>
            {customer?.access_customer_no != null ? 'Access由来' : 'Beaver作成'}
          </span>
        )}
        {!isNew && (
          <button onClick={() => setShowHistory(true)} style={{ ...backBtnStyle, marginLeft: 'auto' }}>
            変更履歴
          </button>
        )}
      </div>

      {!isNew && (
        <HistoryDrawer
          open={showHistory}
          onClose={() => setShowHistory(false)}
          entity="customers"
          entityId={customerId}
          title="得意先の変更履歴"
        />
      )}

      {mutError && (
        <div style={{ marginBottom: 16, padding: '10px 14px', background: '#fee2e2', color: '#dc2626', borderRadius: 6, fontSize: 14 }}>
          保存に失敗しました: {String(mutError)}
        </div>
      )}

      {staleCustomer && (
        <div style={{ marginBottom: 16, padding: '12px 14px', background: '#fef3c7', color: '#92400e', borderRadius: 6, fontSize: 14 }}>
          ほかで更新されています（最終更新: {staleCustomer.updated_at}）。再読み込みすると、この画面で保存されていない入力は失われます。
          <button type="button" onClick={reloadCustomer} style={{ ...backBtnStyle, marginLeft: 12 }}>再読み込み</button>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <CustomerFormFields
          register={register}
          errors={errors}
          setValue={setValue}
          watch={watch}
          code={customer?.code}
          carryForwardBalance={customer?.carry_forward_balance}
          carryForwardEditLink={!isNew && id && billingEditEnabled ? `/customers/${id}/carry-forward` : undefined}
        />

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={goBack} style={cancelBtnStyle}>
            キャンセル
          </button>
          <button type="submit" disabled={isPending} style={submitBtnStyle}>
            {isPending ? '保存中...' : '保存'}
          </button>
        </div>
      </form>

      {!isNew && (
        <div style={{ marginTop: 16, textAlign: 'right' }}>
          <button
            onClick={() => navigate(`/projects?customer_id=${customerId}`)}
            style={projectsBtnStyle}
          >
            この得意先の案件を見る →
          </button>
        </div>
      )}
    </div>
  );
}

const backBtnStyle: React.CSSProperties = {
  padding: '4px 10px', background: 'transparent', border: '1px solid #cbd5e1', borderRadius: 6, cursor: 'pointer', fontSize: 13, color: '#475569',
};
const cancelBtnStyle: React.CSSProperties = {
  padding: '8px 20px', background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', borderRadius: 6, cursor: 'pointer', fontSize: 14,
};
const submitBtnStyle: React.CSSProperties = {
  padding: '8px 24px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14,
};
const projectsBtnStyle: React.CSSProperties = {
  padding: '8px 16px', background: '#f0f9ff', color: '#2563eb', border: '1px solid #bfdbfe',
  borderRadius: 6, cursor: 'pointer', fontSize: 14,
};
