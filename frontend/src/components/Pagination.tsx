interface Props {
  page: number;
  lastPage: number;
  total: number;
  perPage: number;
  onChange: (page: number) => void;
}

export default function Pagination({ page, lastPage, total, perPage, onChange }: Props) {
  if (lastPage <= 1) return null;
  const from = (page - 1) * perPage + 1;
  const to   = Math.min(page * perPage, total);
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderTop: '1px solid #e2e8f0', background: '#f8fafc' }}>
      <span style={{ fontSize: 13, color: '#64748b' }}>
        {total.toLocaleString()}件中 {from}〜{to}件
      </span>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => onChange(page - 1)}
          disabled={page <= 1}
          style={btnStyle(page <= 1)}
        >
          ← 前へ
        </button>
        <span style={{ fontSize: 13, color: '#475569', padding: '6px 0' }}>
          {page} / {lastPage}
        </span>
        <button
          onClick={() => onChange(page + 1)}
          disabled={page >= lastPage}
          style={btnStyle(page >= lastPage)}
        >
          次へ →
        </button>
      </div>
    </div>
  );
}

const btnStyle = (disabled: boolean): React.CSSProperties => ({
  padding: '5px 14px',
  background: disabled ? '#f1f5f9' : '#fff',
  color: disabled ? '#94a3b8' : '#475569',
  border: '1px solid #e2e8f0',
  borderRadius: 6,
  cursor: disabled ? 'default' : 'pointer',
  fontSize: 13,
});
