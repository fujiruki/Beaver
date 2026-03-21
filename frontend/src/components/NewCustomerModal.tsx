import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useCreateCustomer } from '../api/customers';
import type { Customer, CustomerInput } from '../types/customer';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (customer: Customer) => void;
}

export default function NewCustomerModal({ isOpen, onClose, onCreated }: Props) {
  const createMutation = useCreateCustomer();
  const kanaRef = useRef('');
  const [kanaLocked, setKanaLocked] = useState(false);

  const { register, handleSubmit, setValue, reset, formState: { errors } } = useForm<CustomerInput>({
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
    setKanaLocked(false);
    kanaRef.current = '';
    onCreated(created);
  }

  function handleClose() {
    reset();
    setKanaLocked(false);
    kanaRef.current = '';
    onClose();
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.4)',
    }}>
      <div style={{
        background: '#fff', borderRadius: 10, padding: 28, width: 480,
        boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
      }}>
        <h2 style={{ margin: '0 0 20px', fontSize: 17, fontWeight: 'bold' }}>新規得意先登録</h2>

        {createMutation.error && (
          <div style={{ marginBottom: 12, padding: '8px 12px', background: '#fee2e2', color: '#dc2626', borderRadius: 6, fontSize: 13 }}>
            保存に失敗しました: {String(createMutation.error)}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="得意先名 *" error={errors.name?.message}>
            <input
              {...register('name', { required: '必須です' })}
              style={inputStyle}
              onCompositionUpdate={(e) => {
                if (/^[\u3040-\u309F]+$/.test(e.data)) kanaRef.current = e.data;
              }}
              onCompositionEnd={() => {
                if (!kanaLocked && kanaRef.current) setValue('name_kana', kanaRef.current);
              }}
            />
          </Field>
          <Field label="ふりがな">
            <input
              {...register('name_kana')}
              style={inputStyle}
              onChange={(e) => {
                setKanaLocked(true);
                register('name_kana').onChange(e);
              }}
            />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="敬称">
              <select {...register('honorific_type')} style={inputStyle}>
                <option value="御中">御中</option>
                <option value="様">様</option>
                <option value="殿">殿</option>
              </select>
            </Field>
            <Field label="電話番号">
              <input {...register('tel')} style={inputStyle} />
            </Field>
          </div>
          <Field label="備考">
            <textarea {...register('memo')} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
          </Field>

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

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 'bold', color: '#475569' }}>{label}</label>
      {children}
      {error && <p style={{ margin: '4px 0 0', fontSize: 12, color: '#dc2626' }}>{error}</p>}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '7px 10px', border: '1px solid #cbd5e1',
  borderRadius: 6, fontSize: 14, boxSizing: 'border-box',
};
const cancelBtnStyle: React.CSSProperties = {
  padding: '8px 20px', background: '#f1f5f9', color: '#475569',
  border: '1px solid #cbd5e1', borderRadius: 6, cursor: 'pointer', fontSize: 14,
};
const submitBtnStyle: React.CSSProperties = {
  padding: '8px 24px', background: '#2563eb', color: '#fff',
  border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14,
};
