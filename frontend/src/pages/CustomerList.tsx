import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCustomersPaged, useDeleteCustomer } from '../api/customers';
import Pagination from '../components/Pagination';
import DataTable, { useSortState } from '../components/DataTable';
import type { DataTableColumn, SortDir } from '../components/DataTable';
import type { Customer } from '../types/customer';

export default function CustomerList() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [inputValue, setInputValue] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useSortState('customers');
  const isComposingRef = useRef(false);
  const { data, isLoading, error } = useCustomersPaged(page, search, sort);
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

  function handleSortChange(key: string, dir: SortDir) {
    setSort(key, dir);
    setPage(1);
  }

  if (isLoading) return <div>読み込み中...</div>;
  if (error)     return <div style={{ color: 'red' }}>エラー: {String(error)}</div>;

  const columns: DataTableColumn<Customer>[] = [
    { key: 'code', label: 'コード', sortable: true, render: c => c.code },
    { key: 'name', label: '得意先名', sortable: true, render: c => c.name },
    { key: 'tel', label: '電話', sortable: true, render: c => c.tel ?? '—' },
    { key: 'address1', label: '住所', sortable: true, render: c => `${c.address1 ?? ''} ${c.address2 ?? ''}`.trim() || '—' },
    {
      key: 'actions',
      label: '',
      width: 120,
      align: 'right',
      stopRowClick: true,
      render: c => (
        <>
          <button onClick={() => navigate(`/customers/${c.id}`)} style={btnSmStyle('#475569')}>
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
        </>
      ),
    },
  ];

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
        <DataTable
          tableId="customers"
          columns={columns}
          rows={customers}
          rowKey={c => c.id}
          onRowClick={c => navigate(`/customers/${c.id}`)}
          sortKey={sort?.key}
          sortDir={sort?.dir}
          onSortChange={handleSortChange}
        />
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

const btnStyle = (bg: string): React.CSSProperties => ({
  padding: '6px 14px', background: bg, color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14,
});
const btnSmStyle = (bg: string): React.CSSProperties => ({
  padding: '4px 10px', background: bg, color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12,
});
