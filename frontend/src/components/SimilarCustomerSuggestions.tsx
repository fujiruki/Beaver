import { useEffect, useState } from 'react';
import { useSimilarCustomers, type SimilarCustomer, type SimilarCustomerParams } from '../api/customers';

interface Props extends SimilarCustomerParams {
  enabled: boolean;
  onSelect: (customer: SimilarCustomer) => void;
}

const MATCH_LABELS = { tel: '電話', name: '名前', name_kana: 'カナ' } as const;

export default function SimilarCustomerSuggestions({ enabled, onSelect, ...values }: Props) {
  const [debounced, setDebounced] = useState(values);

  useEffect(() => {
    if (!enabled) return;
    const timer = window.setTimeout(() => setDebounced(values), 300);
    return () => window.clearTimeout(timer);
  }, [enabled, values.name, values.name_kana, values.tel, values.mobile]);

  const hasInput = Boolean(debounced.name || debounced.name_kana || debounced.tel || debounced.mobile);
  const { data } = useSimilarCustomers(debounced, enabled && hasInput);
  if (!enabled || !data?.length) return null;

  return (
    <section style={{ padding: 16, border: '1px solid #f59e0b', borderRadius: 8, background: '#fffbeb' }}>
      <p style={{ margin: '0 0 10px', fontWeight: 'bold', color: '#92400e' }}>
        似た得意先があります。同じ得意先ならそちらを使ってください
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {data.map((customer) => (
          <button
            key={customer.id}
            type="button"
            onClick={() => onSelect(customer)}
            style={{ padding: 10, textAlign: 'left', border: '1px solid #fcd34d', borderRadius: 6, background: '#fff', cursor: 'pointer' }}
            aria-label={`${customer.code ?? ''} ${customer.name}`}
          >
            <span style={{ fontWeight: 'bold' }}>{customer.code}　{customer.name}</span>
            {customer.is_active === 0 && <span style={{ marginLeft: 8, color: '#dc2626' }}>無効</span>}
            <div style={{ marginTop: 4, fontSize: 13, color: '#475569' }}>
              {[customer.name_kana, customer.tel, customer.address1].filter(Boolean).join(' ／ ')}
            </div>
            <div style={{ marginTop: 3, fontSize: 12, color: '#92400e' }}>
              一致: {customer.matched.map((matched) => MATCH_LABELS[matched]).join('・')}
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
