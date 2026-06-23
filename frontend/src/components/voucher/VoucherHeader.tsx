import { useFormContext } from 'react-hook-form';
import type { Customer } from '../../types/customer';
import type { Project } from '../../types/project';
import type { VoucherFormValues } from '../../pages/VoucherEdit';
import { useSalesCategories } from '../../api/salesCategories';

interface Props {
  customers: Customer[];
  projects: Project[];
  readOnly?: boolean;
}

const STATUS_OPTIONS = [
  { value: 'draft',     label: '下書き' },
  { value: 'submitted', label: '提出済' },
  { value: 'approved',  label: '承認済' },
  { value: 'billed',    label: '請求済' },
  { value: 'void',      label: '無効'   },
];

export default function VoucherHeader({ customers, projects, readOnly = false }: Props) {
  const { register, watch, setValue, formState: { errors } } = useFormContext<VoucherFormValues>();
  const taxInputType = watch('tax_input_type');
  const voucherType = watch('voucher_type');
  const { data: salesCategories = [] } = useSalesCategories();

  return (
    <div style={{
      background: '#fff', borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      marginBottom: 16, overflow: 'hidden',
    }}>
      {/* 行1: 得意先 / 案件 / 伝票日付 / ステータス / 伝票種別 */}
      <div style={{
        display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 1fr 1fr',
        gap: 12, padding: '12px 16px', borderBottom: '1px solid #f1f5f9',
      }}>
        <Field label="得意先 *" error={errors.customer_id?.message}>
          <select
            {...register('customer_id', { valueAsNumber: true, required: '必須です' })}
            style={selStyle}
            disabled={readOnly}
          >
            <option value={0}>-- 選択してください --</option>
            {customers.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Field>

        <Field label="案件">
          <select
            {...register('project_id', { setValueAs: v => v === '' || v === '0' ? null : Number(v) })}
            style={selStyle}
            disabled={readOnly}
          >
            <option value="">-- 案件なし --</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </Field>

        <Field label="伝票日付 *" error={errors.voucher_date?.message}>
          <input
            type="date"
            {...register('voucher_date', { required: '必須です' })}
            style={inpStyle}
            disabled={readOnly}
          />
        </Field>

        <Field label="ステータス">
          <select {...register('status')} style={selStyle} disabled={readOnly}>
            {STATUS_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </Field>

        <Field label="伝票種別">
          <select {...register('voucher_type')} style={selStyle} disabled={readOnly}>
            <option value="estimate">見積</option>
            <option value="sales">売上</option>
          </select>
        </Field>
      </div>

      {/* 行2: 摘要 / 売上種別 / 納期 / 有効期限(見積のみ) / 税入力切替 */}
      <div style={{
        display: 'grid', gridTemplateColumns: voucherType === 'estimate' ? '3fr 1fr 1fr 1fr auto' : '3fr 1fr 1fr auto',
        gap: 12, padding: '12px 16px', alignItems: 'end',
      }}>
        <Field label="摘要">
          <input
            {...register('description')}
            placeholder="案件・工事内容など"
            style={inpStyle}
            disabled={readOnly}
          />
        </Field>

        <Field label="売上種別">
          <select {...register('sales_category_id', { setValueAs: v => v === '' ? null : Number(v) })} style={selStyle} disabled={readOnly}>
            <option value="">-- 種別なし --</option>
            {salesCategories.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Field>

        <Field label="納期">
          <input
            type="date"
            {...register('delivery_date')}
            style={inpStyle}
            disabled={readOnly}
          />
        </Field>

        {voucherType === 'estimate' && (
          <Field label="有効期限">
            <input
              {...register('validity_period')}
              placeholder="例: 見積後30日間"
              style={inpStyle}
              disabled={readOnly}
            />
          </Field>
        )}

        {/* 税込/税抜 トグル */}
        <div>
          <label style={{ display: 'block', marginBottom: 6, fontSize: 12, fontWeight: 'bold', color: '#475569' }}>
            売価金額の入力方式
          </label>
          <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: '1px solid #cbd5e1' }}>
            <button
              type="button"
              disabled={readOnly}
              onClick={() => setValue('tax_input_type', 'exclusive')}
              style={{
                padding: '6px 16px', fontSize: 13, fontWeight: 'bold', cursor: readOnly ? 'default' : 'pointer',
                border: 'none', borderRight: '1px solid #cbd5e1',
                background: taxInputType === 'exclusive' ? '#1d4ed8' : '#f8fafc',
                color: taxInputType === 'exclusive' ? '#fff' : '#64748b',
                transition: 'background 0.15s',
              }}
            >
              税抜入力
            </button>
            <button
              type="button"
              disabled={readOnly}
              onClick={() => setValue('tax_input_type', 'inclusive')}
              style={{
                padding: '6px 16px', fontSize: 13, fontWeight: 'bold', cursor: readOnly ? 'default' : 'pointer',
                border: 'none',
                background: taxInputType === 'inclusive' ? '#1d4ed8' : '#f8fafc',
                color: taxInputType === 'inclusive' ? '#fff' : '#64748b',
                transition: 'background 0.15s',
              }}
            >
              税込入力
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, error, children }: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label style={{ display: 'block', marginBottom: 4, fontSize: 12, fontWeight: 'bold', color: '#475569' }}>
        {label}
      </label>
      {children}
      {error && <p style={{ margin: '4px 0 0', fontSize: 11, color: '#dc2626' }}>{error}</p>}
    </div>
  );
}

const inpStyle: React.CSSProperties = {
  width: '100%', padding: '6px 10px', border: '1px solid #cbd5e1',
  borderRadius: 6, fontSize: 13, boxSizing: 'border-box',
};
const selStyle: React.CSSProperties = {
  width: '100%', padding: '6px 10px', border: '1px solid #cbd5e1',
  borderRadius: 6, fontSize: 13, boxSizing: 'border-box',
};
