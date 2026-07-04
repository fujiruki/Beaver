import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCustomersPaged, useDeleteCustomer } from '../api/customers';
import Pagination from '../components/Pagination';

export default function CustomerList() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [inputValue, setInputValue] = useState('');
  const [search, setSearch] = useState('');
  const isComposingRef = useRef(false);
  const { data, isLoading, error } = useCustomersPaged(page, search);
  const deleteMutation = useDeleteCustomer();

  const customers = data?.data ?? [];
  const meta = data?.meta;

  function commitSearch(q: string) {
    setSearch(q);
    setPage(1);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setInputValue(value);
    if (!isComposingRef.current) commitSearch(value);
  }

  function handleCompositionStart() {
    isComposingRef.current = true;
  }

  function handleCompositionEnd(e: React.CompositionEvent<HTMLInputElement>) {
    isComposingRef.current = false;
    commitSearch(e.currentTarget.value);
  }

  function handleDelete(id: number, name: string) {
    if (!confirm(`「${name}」を削除しますか？`)) return;
    deleteMutation.mutate(id);
  }

  if (isLoading) return <div>読み込み中...</div>;
  if (error)     return <div style={{ color: 'red' }}>エラー: {String(error)}</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 'bold' }}>得意先一覧</h1>
        <button
          onClick={() => navigate('/customers/new')}
          style={btnStyle('#2563eb')}
        >
          ＋ 新規登録
        </button>
      </div>

      <div style={{ marginBottom: 12 }}>
        <input
          type="text"
          placeholder="得意先名・コードで検索"
          value={inputValue}
          onChange={handleChange}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13, width: 240 }}
        />
      </div>

      <div style={{ background: '#fff', borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #e2e8f0' }}>
              <th style={thStyle}>コード</th>
              <th style={thStyle}>得意先名</th>
              <th style={thStyle}>電話</th>
              <th style={thStyle}>住所</th>
              <th style={{ ...thStyle, width: 120 }}></th>
            </tr>
          </thead>
          <tbody>
            {customers.length === 0 && (
              <tr><td colSpan={5} style={{ padding: 16, textAlign: 'center', color: '#94a3b8' }}>登録なし</td></tr>
            )}
            {customers.map(c => (
              <tr
                key={c.id}
                style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }}
                onClick={() => navigate(`/customers/${c.id}`)}
              >
                <td style={tdStyle}>{c.code}</td>
                <td style={tdStyle}>{c.name}</td>
                <td style={tdStyle}>{c.tel ?? '—'}</td>
                <td style={tdStyle}>{`${c.address1 ?? ''} ${c.address2 ?? ''}`.trim() || '—'}</td>
                <td style={{ ...tdStyle, textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => navigate(`/customers/${c.id}`)}
                    style={btnSmStyle('#475569')}
                  >
                    編集
                  </button>
                  {' '}
                  <button
                    onClick={() => handleDelete(c.id, c.name)}
                    style={btnSmStyle('#dc2626')}
                    disabled={deleteMutation.isPending}
                  >
                    削除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {meta && (
          <Pagination
            page={meta.page}
            lastPage={meta.last_page}
            total={meta.total}
            perPage={meta.per_page}
            onChange={p => setPage(p)}
          />
        )}
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: '10px 12px', textAlign: 'left', fontSize: 13, fontWeight: 'bold', color: '#475569',
};
const tdStyle: React.CSSProperties = {
  padding: '10px 12px', fontSize: 14, color: '#1e293b',
};
const btnStyle = (bg: string): React.CSSProperties => ({
  padding: '6px 14px', background: bg, color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14,
});
const btnSmStyle = (bg: string): React.CSSProperties => ({
  padding: '4px 10px', background: bg, color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12,
});
