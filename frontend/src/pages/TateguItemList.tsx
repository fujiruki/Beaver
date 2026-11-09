import { useAutoFocusSearch } from '../hooks/useAutoFocusSearch';
import { useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTateguItemsPaged, useDeleteTateguItem, useToggleFavorite } from '../api/tateguItems';
import { useLedgerCatalogs, useAddToLedgerCatalog, useRemoveFromLedgerCatalog, useCreateLedgerCatalog } from '../api/ledgerCatalogs';
import FavoriteStar from '../components/FavoriteStar';
import Pagination from '../components/Pagination';
import DataTable, { useSortState } from '../components/DataTable';
import type { DataTableColumn, SortDir, SortState } from '../components/DataTable';
import type { TateguItem } from '../types/tateguItem';

export default function TateguItemList() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [page, setPage] = useState(() => {
    const p = Number(searchParams.get('page'));
    return Number.isFinite(p) && p > 0 ? p : 1;
  });
  const [inputValue, setInputValue] = useState(() => searchParams.get('q') ?? '');
  const [search, setSearch] = useState(() => searchParams.get('q') ?? '');
  const urlSortKey = searchParams.get('sort');
  const [sort, setSortStorage] = useSortState('tategu-items',
    urlSortKey ? { key: urlSortKey, dir: searchParams.get('order') === 'desc' ? 'desc' : 'asc' } : undefined);
  const isComposingRef = useRef(false);
  const searchRef = useAutoFocusSearch();
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [menuItemId, setMenuItemId] = useState<number | null>(null);
  const { data, isLoading, error } = useTateguItemsPaged(page, search, sort, favoriteOnly);
  const deleteMutation = useDeleteTateguItem();
  const toggleFavorite = useToggleFavorite();
  const { data: catalogs = [] } = useLedgerCatalogs(menuItemId !== null);
  const addToCatalog = useAddToLedgerCatalog();
  const removeFromCatalog = useRemoveFromLedgerCatalog();
  const createCatalog = useCreateLedgerCatalog();

  const items = data?.data ?? [];
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

  if (isLoading) return <div className="p-6">読み込み中...</div>;
  if (error)     return <div className="p-6 text-red-600">エラー: {String(error)}</div>;

  function totalCostOf(item: TateguItem): number {
    return item.cost_body + item.cost_hardware + item.cost_glass
      + (item.cost_factory_hours + item.cost_site_hours) * item.cost_labor_rate;
  }

  const inCatalogs = (item: TateguItem) => (item.catalog_names ?? []).length > 0;
  const catalogLabel = (item: TateguItem) => (item.catalog_names ?? []).join('、');

  async function addToNewCatalog(itemId: number) {
    const name = prompt('新しいカタログの名前')?.trim();
    if (!name) return;
    const created = await createCatalog.mutateAsync(name);
    addToCatalog.mutate({ catalogId: created.id, itemId });
    setMenuItemId(null);
  }

  const columns: DataTableColumn<TateguItem>[] = [
    {
      key: 'favorite',
      label: '',
      width: 44,
      stopRowClick: true,
      render: item => (
        <FavoriteStar
          isFavorite={!!item.is_favorite}
          onToggle={() => toggleFavorite.mutate({ id: item.id, is_favorite: !item.is_favorite })}
        />
      ),
    },
    { key: 'code', label: '製品№', sortable: true, render: item => item.code || '採番待ち' },
    { key: 'name', label: '品名', sortable: true, render: item => item.name },
    { key: 'description', label: '備考', render: item => item.description ?? '—' },
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
      width: 300,
      align: 'right',
      stopRowClick: true,
      render: item => (
        <>
          <span className="relative inline-block mr-1">
            <button
              type="button"
              aria-label={inCatalogs(item) ? catalogLabel(item) : 'カタログに追加'}
              title={inCatalogs(item) ? catalogLabel(item) : undefined}
              onClick={() => setMenuItemId(menuItemId === item.id ? null : item.id)}
              className={`px-2.5 py-1 bg-slate-100 border border-slate-300 rounded text-xs hover:bg-slate-200 align-middle ${inCatalogs(item) ? 'text-slate-800 inline-flex max-w-44' : 'text-slate-600'}`}
            >
              {inCatalogs(item)
                ? <><span className="truncate">{catalogLabel(item)}</span>▼</>
                : 'カタログに追加▼'}
            </button>
            {menuItemId === item.id && (
              <div role="menu" className="absolute right-0 z-10 mt-1 min-w-40 bg-white border border-slate-200 rounded-md shadow-lg py-1 text-left">
                {catalogs.map(c => {
                  const included = (item.catalog_ids ?? []).includes(c.id);
                  return (
                    <button key={c.id} type="button" role="menuitem" className="block w-full text-left px-3 py-1.5 text-sm hover:bg-slate-100"
                      onClick={() => {
                        (included ? removeFromCatalog : addToCatalog).mutate({ catalogId: c.id, itemId: item.id });
                        setMenuItemId(null);
                      }}>{included ? `✓ ${c.name}` : c.name}</button>
                  );
                })}
                <button role="menuitem" className="block w-full text-left px-3 py-1.5 text-sm text-blue-600 hover:bg-slate-100"
                  onClick={() => addToNewCatalog(item.id)}>＋ 新しいカタログを作る</button>
              </div>
            )}
          </span>
          <button onClick={() => navigate('/tategu/new', { state: { cloneFromId: item.id } })} className="px-2.5 py-1 bg-slate-100 border border-slate-300 text-slate-600 rounded text-xs mr-1 hover:bg-slate-200">引用</button>
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
        <h1 className="text-xl font-bold">製品台帳</h1>
        <div className="flex gap-2">
          <button
            onClick={() => navigate('/tategu/catalogs')}
            className="px-3 py-2 bg-slate-100 border border-slate-300 text-slate-600 rounded-md text-sm hover:bg-slate-200"
          >
            カタログを編集
          </button>
          <button
            onClick={() => navigate('/tategu/new')}
            className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700"
          >
            ＋ 新規登録
          </button>
        </div>
      </div>

      <div className="mb-3 flex items-center gap-4">
        <input
          type="text"
          ref={searchRef}
          placeholder="品番・品名・仕様で検索"
          value={inputValue}
          onChange={handleChange}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          className="px-3 py-1.5 border border-slate-300 rounded-md text-sm w-60"
        />
        <label className="flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer hover:text-slate-800">
          <input type="checkbox" checked={favoriteOnly} onChange={e => { setFavoriteOnly(e.target.checked); setPage(1); }} />
          お気に入りだけ
        </label>
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
            onChange={handlePageChange}
          />
        )}
      </div>
    </div>
  );
}
