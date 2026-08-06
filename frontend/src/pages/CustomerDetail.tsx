import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useCustomer, useCreateCustomer, useUpdateCustomer } from '../api/customers';
import CustomerFormFields from '../components/CustomerFormFields';
import HistoryDrawer from '../components/history/HistoryDrawer';
import type { CustomerInput } from '../types/customer';

export default function CustomerDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const customerId = id ? Number(id) : 0;
  const isNew = !id;

  const { data: customer, isLoading } = useCustomer(customerId);
  const createMutation = useCreateCustomer();
  const updateMutation = useUpdateCustomer(customerId);
  const [showHistory, setShowHistory] = useState(false);

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
    if (customer) {
      reset({
        ...customer,
        cutoff_day: customer.cutoff_day === 0 ? 31 : customer.cutoff_day,
      });
    }
  }, [customer, reset]);

  async function onSubmit(data: CustomerInput) {
    if (isNew) {
      await createMutation.mutateAsync(data);
    } else {
      await updateMutation.mutateAsync(data);
    }
    navigate('/customers');
  }

  if (!isNew && isLoading) return <div>読み込み中...</div>;

  const isPending = createMutation.isPending || updateMutation.isPending;
  const mutError  = createMutation.error || updateMutation.error;

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button onClick={() => navigate('/customers')} style={backBtnStyle}>← 戻る</button>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 'bold' }}>
          {isNew ? '得意先 新規登録' : '得意先 編集'}
        </h1>
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

      <form onSubmit={handleSubmit(onSubmit)} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <CustomerFormFields
          register={register}
          errors={errors}
          setValue={setValue}
          watch={watch}
          code={customer?.code}
          carryForwardBalance={customer?.carry_forward_balance}
          carryForwardEditLink={!isNew && id ? `/customers/${id}/carry-forward` : undefined}
        />

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={() => navigate('/customers')} style={cancelBtnStyle}>
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
