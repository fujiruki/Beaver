import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { FieldErrors, UseFormRegister, UseFormSetValue, UseFormWatch } from 'react-hook-form';
import type { CustomerInput } from '../types/customer';
import { nextKanaValue } from '../lib/kanaAutoFill';

const CUTOFF_OPTIONS = [
  { label: '5日',  value: 5  },
  { label: '10日', value: 10 },
  { label: '15日', value: 15 },
  { label: '20日', value: 20 },
  { label: '25日', value: 25 },
  { label: '末日', value: 31 },
];

interface Props {
  register: UseFormRegister<CustomerInput>;
  errors: FieldErrors<CustomerInput>;
  setValue: UseFormSetValue<CustomerInput>;
  watch: UseFormWatch<CustomerInput>;
  code?: string | null;
  carryForwardBalance?: number;
  carryForwardEditLink?: string;
}

export default function CustomerFormFields({ register, errors, setValue, watch, code, carryForwardBalance, carryForwardEditLink }: Props) {
  const kanaRef = useRef('');
  const [kanaLocked, setKanaLocked] = useState(false);

  const watchedName = watch('name');
  useEffect(() => {
    if (!watchedName) setKanaLocked(false);
  }, [watchedName]);

  return (
    <>
      <Section title="基本情報">
        <div style={grid2}>
          <Field label="得意先コード">
            <div style={{ ...inputStyle, background: '#f1f5f9', color: '#64748b' }}>
              {code ?? '自動採番'}
            </div>
          </Field>
          <Field label="得意先名 *" error={errors.name?.message}>
            <input
              {...register('name', { required: '必須です' })}
              style={inputStyle}
              onCompositionUpdate={(e) => {
                if (/^[぀-ゟ]+$/.test(e.data)) kanaRef.current = e.data;
              }}
              onCompositionEnd={() => {
                // R-0113: 直前の確定分を上書きせず、既存のよみに追記する
                setValue('name_kana', nextKanaValue(watch('name_kana') ?? '', kanaRef.current, kanaLocked));
                kanaRef.current = '';
              }}
            />
          </Field>
          <Field label="フリガナ">
            <input
              {...register('name_kana')}
              style={inputStyle}
              onChange={(e) => {
                setKanaLocked(true);
                register('name_kana').onChange(e);
              }}
            />
          </Field>
          <Field label="敬称">
            <select {...register('honorific_type')} style={inputStyle}>
              <option value="御中">御中</option>
              <option value="様">様</option>
              <option value="殿">殿</option>
            </select>
          </Field>
        </div>
      </Section>

      <Section title="連絡先">
        <div style={grid2}>
          <Field label="郵便番号">
            <input {...register('postal_code')} style={inputStyle} placeholder="123-4567" />
          </Field>
          <div />
          <Field label="住所1">
            <input {...register('address1')} style={inputStyle} />
          </Field>
          <Field label="住所2">
            <input {...register('address2')} style={inputStyle} />
          </Field>
          <Field label="電話番号">
            <input {...register('tel')} style={inputStyle} />
          </Field>
          <Field label="携帯電話">
            <input {...register('mobile')} style={inputStyle} />
          </Field>
          <Field label="FAX">
            <input {...register('fax')} style={inputStyle} />
          </Field>
          <Field label="メールアドレス">
            <input {...register('email')} type="email" style={inputStyle} />
          </Field>
        </div>
      </Section>

      <Section title="請求情報">
        <div style={grid2}>
          <Field label="請求先名（省略時は得意先名）">
            <input {...register('billing_name')} style={inputStyle} />
          </Field>
          <Field label="締日">
            <select {...register('cutoff_day', { valueAsNumber: true })} style={inputStyle}>
              {CUTOFF_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>
          <Field label="請求書発行オフセット（日）">
            <input {...register('billing_offset_days', { valueAsNumber: true })} type="number" min={0} style={inputStyle} />
          </Field>
          <Field label="支払期日（日）">
            <input {...register('payment_due_days', { valueAsNumber: true })} type="number" min={0} style={inputStyle} />
          </Field>
          <Field label="繰越残高">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 14, color: '#1e293b' }}>
                {carryForwardBalance != null ? `¥${carryForwardBalance.toLocaleString()}` : '—'}
              </span>
              {carryForwardEditLink && (
                <Link to={carryForwardEditLink} style={{ fontSize: 12, color: '#2563eb', textDecoration: 'underline' }}>
                  修正する
                </Link>
              )}
            </div>
          </Field>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 20, paddingBottom: 2 }}>
            <label style={checkLabelStyle}>
              <input {...register('billing_date_print', { setValueAs: v => v ? 1 : 0 })} type="checkbox" />
              請求日を印字する
            </label>
            <label style={checkLabelStyle}>
              <input {...register('is_active', { setValueAs: v => v ? 1 : 0 })} type="checkbox" defaultChecked />
              有効
            </label>
          </div>
        </div>
      </Section>

      <Section title="備考">
        <textarea {...register('memo')} rows={3} style={{ ...inputStyle, width: '100%', resize: 'vertical' }} />
      </Section>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', padding: 24, borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
      <h2 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 'bold', color: '#334155', borderBottom: '1px solid #e2e8f0', paddingBottom: 8 }}>
        {title}
      </h2>
      {children}
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
      <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 'bold', color: '#475569' }}>
        {label}
      </label>
      {children}
      {error && <p style={{ margin: '4px 0 0', fontSize: 12, color: '#dc2626' }}>{error}</p>}
    </div>
  );
}

const grid2: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 };
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '7px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 14, boxSizing: 'border-box',
};
const checkLabelStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, color: '#334155', cursor: 'pointer',
};
