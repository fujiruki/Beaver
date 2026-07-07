import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTateguItemsPaged, useDeleteTateguItem } from '../api/tateguItems';
import Pagination from '../components/Pagination';
import DataTable from '../components/DataTable';
import type { DataTableColumn, SortDir } from '../components/DataTable';
import type { TateguItem } from '../types/tateguItem';
import type { SortParam } from '../types/pagination';

export default function TateguItemList() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [inputValue, setInputValue] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortParam | undefined>(undefined);
  const isComposingRef = useRef(false);
  const { data, isLoading, error } = useTateguItemsPaged(page, search, sort);
  const deleteMutation = useDeleteTateguItem();

  const items = data?.data ?? [];
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
    setSort({ key, dir });
    setPage(1);
  }

  if (isLoading) return <div className="p-6">読み込み中...</div>;
  if (error)     return <div className="p-6 text-red-600">エラー: {String(error)}</div>;

  function totalCostOf(item: TateguItem): number {
    return item.cost_body + item.cost_hardware + item.cost_glass
      + (item.cost_factory_hours + item.cost_site_hours) * item.cost_labor_rate;
  }

  const columns: DataTableColumn<TateguItem>[] = [
    { key: 'code', label: 'コード', sortable: true, render: item => item.item_code },
    { key: 'name', label: '品名', sortable: true, render: item => item.name },
    { key: 'spec', label: '仕様', render: item => item.spec ?? '—' },
    {
      key: 'total_cost',
      label: '製造原価',
      align: 'right',
      sortable: true,
      render: item => `¥${totalCostOf(item).toLocaleString()}`,
    },
    { key: 'unit', label: '単位', render: item => item.unit ?? '—' },
    {
      key: 'actions',
      label: '',
      width: 120,
      align: 'right',
      stopRowClick: true,
      render: item => (
        <>
          <button onClick={() => navigate(`/tategu/${item.id}`)} className="px-2.5 py-1 bg-slate-500 text-white rounded text-xs mr-1 hover:bg-slate-600">編集</button>
          <button
            onClick={() => handleDelete(item.id, item.name)}
            className="px-2.5 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700"
            disabled={deleteMutation.isPending}
          >削除</button>
        </>
      ),
    },
  ];

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl font-bold">建具台帳</h1>
        <button
          onClick={() => navigate('/tategu/new')}
          className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700"
        >
          ＋ 新規登録
        </button>
      </div>

      <div className="mb-3">
        <input
          type="text"
          placeholder="品名・コードで検索"
          value={inputValue}
          onChange={handleChange}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          className="px-3 py-1.5 border border-slate-300 rounded-md text-sm w-60"
        />
      </div>

      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <DataTable
          tableId="tategu-items"
          columns={columns}
          rows={items}
          rowKey={item => item.id}
          onRowClick={item => navigate(`/tategu/${item.id}`)}
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
