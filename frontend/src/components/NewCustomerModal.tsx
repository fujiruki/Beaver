import { useForm } from 'react-hook-form';
import { useCreateCustomer } from '../api/customers';
import CustomerFormFields from './CustomerFormFields';
import type { Customer, CustomerInput } from '../types/customer';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (customer: Customer) => void;
}

export default function NewCustomerModal({ isOpen, onClose, onCreated }: Props) {
  const createMutation = useCreateCustomer();

  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm<CustomerInput>({
    defaultValues: {
      honorific_type: '御中',
      cutoff_day: 31,
      billing_offset_days: 15,
      payment_due_days: 30,
      billing_date_print: 0,
      is_active: 1,
    },
  });

  if (!isOpen) return null;

  async function onSubmit(data: CustomerInput) {
    const created = await createMutation.mutateAsync(data);
    reset();
    onCreated(created);
  }

  function handleClose() {
    reset();
    onClose();
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.4)', padding: 24,
    }}>
      <div style={{
        background: '#f8fafc', borderRadius: 10, padding: 28, width: '100%', maxWidth: 800,
        maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
      }}>
        <h2 style={{ margin: '0 0 20px', fontSize: 17, fontWeight: 'bold' }}>新規得意先登録</h2>

        {createMutation.error && (
          <div style={{ marginBottom: 12, padding: '8px 12px', background: '#fee2e2', color: '#dc2626', borderRadius: 6, fontSize: 13 }}>
            保存に失敗しました: {String(createMutation.error)}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <CustomerFormFields register={register} errors={errors} setValue={setValue} watch={watch} />

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
            <button type="button" onClick={handleClose} style={cancelBtnStyle}>
              キャンセル
            </button>
            <button type="submit" disabled={createMutation.isPending} style={submitBtnStyle}>
              {createMutation.isPending ? '登録中...' : '登録'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const cancelBtnStyle: React.CSSProperties = {
  padding: '8px 20px', background: '#f1f5f9', color: '#475569',
  border: '1px solid #cbd5e1', borderRadius: 6, cursor: 'pointer', fontSize: 14,
};
const submitBtnStyle: React.CSSProperties = {
  padding: '8px 24px', background: '#2563eb', color: '#fff',
  border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14,
};
