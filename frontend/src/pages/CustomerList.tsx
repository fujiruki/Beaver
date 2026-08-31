import { useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useCustomersPaged, useDeleteCustomer } from '../api/customers';
import Pagination from '../components/Pagination';
import DataTable, { useSortState } from '../components/DataTable';
import type { DataTableColumn, SortDir, SortState } from '../components/DataTable';
import type { Customer } from '../types/customer';

export default function CustomerList() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [page, setPage] = useState(() => {
    const p = Number(searchParams.get('page'));
    return Number.isFinite(p) && p > 0 ? p : 1;
  });
  const [inputValue, setInputValue] = useState(() => searchParams.get('q') ?? '');
  const [search, setSearch] = useState(() => searchParams.get('q') ?? '');
  const urlSortKey = searchParams.get('sort');
  const [sort, setSortStorage] = useSortState('customers',
    urlSortKey ? { key: urlSortKey, dir: searchParams.get('order') === 'desc' ? 'desc' : 'asc' } : undefined);
  const isComposingRef = useRef(false);
  const { data, isLoading, error } = useCustomersPaged(page, search, sort);
  const deleteMutation = useDeleteCustomer();

  const customers = data?.data ?? [];
  const meta = data?.meta;

  // R-0096: 検索語・ページ・ソートの状態をURLクエリへ反映し、リロード後も復元できるようにする
  function syncUrl(nextPage: number, nextSearch: string, nextSort?: SortState) {
    const next = new URLSearchParams();
    if (nextPage > 1) next.set('page', String(nextPage));
    if (nextSearch) next.set('q', nextSearch);
    if (nextSort) {
      next.set('sort', nextSort.key);
      next.set('order', nextSort.dir);
    }
    setSearchParams(next, { replace: true });
  }

  function commitSearch(q: string) {
    setSearch(q);
    setPage(1);
    syncUrl(1, q, sort);
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

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    // R-0083: 検索結果が1件に絞られた状態でEnterを押すと、その1件の詳細画面へ遷移する
    if (e.key === 'Enter' && customers.length === 1) {
      navigate(`/customers/${customers[0].id}`);
    }
  }

  function handleDelete(id: number, name: string) {
    if (!confirm(`「${name}」を削除しますか？`)) return;
    deleteMutation.mutate(id);
  }

  function handleSortChange(key: string, dir: SortDir) {
    setSortStorage(key, dir);
    setPage(1);
    syncUrl(1, search, { key, dir });
  }

  function handlePageChange(p: number) {
    setPage(p);
    syncUrl(p, search, sort);
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
          onKeyDown={handleSearchKeyDown}
          style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13, width: 240 }}
        />
      </div>

      <div style={{ background: '#fff', borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
        <div className="md:hidden" data-testid="customer-mobile-list">
          {customers.map(c => {
            const address = `${c.address1 ?? ''} ${c.address2 ?? ''}`.trim() || '—';
            return (
              <div
                key={c.id}
                data-testid="customer-mobile-row"
                onClick={() => navigate(`/customers/${c.id}`)}
                className="p-3 border-b border-slate-100 last:border-0 cursor-pointer"
                style={{ minHeight: 44 }}
              >
                <div className="font-bold text-sm">
                  {c.name}
                  <span className="text-slate-400 text-xs ml-2">{c.code}</span>
                </div>
                <div className="flex items-center gap-2 mt-1 text-sm text-slate-500" style={{ overflow: 'hidden' }}>
                  {c.tel && (
                    <a href={`tel:${c.tel}`} onClick={e => e.stopPropagation()} className="text-blue-600">
                      {c.tel}
                    </a>
                  )}
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {address}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="hidden md:block" data-testid="customer-desktop-table">
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
        </div>
        {meta && (
          <Pagination
            page={meta.page}
            lastPage={meta.last_page}
            total={meta.total}
            perPage={meta.per_page}
            onChange={handlePageChange}
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
