import { useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useProjectsPaged, useDeleteProject } from '../api/projects';
import { useCustomers } from '../api/customers';
import { useAppSettings } from '../contexts/AppSettingsContext';
import Pagination from '../components/Pagination';
import DataTable from '../components/DataTable';
import type { DataTableColumn, SortState } from '../components/DataTable';
import type { Project, ProjectStatus } from '../types/project';

// R-0091: sort=a,b&order=asc,desc 形式のURLクエリを複合ソートキー配列に変換する
function parseSortKeys(sortParam: string | null, orderParam: string | null): SortState[] {
  if (!sortParam) return [];
  const keys = sortParam.split(',').filter(Boolean);
  const dirs = (orderParam ?? '').split(',');
  return keys.map((key, i) => ({ key, dir: dirs[i] === 'desc' ? 'desc' : 'asc' }));
}

const statusLabel: Record<ProjectStatus, string> = {
  '問い合わせ': '問い合わせ',
  '見積済':     '見積済',
  '受注済':     '受注済',
  '進行中':     '進行中',
  '納品済':     '納品済',
  '請求済':     '請求済',
  '完了':       '完了',
};
const statusColor: Record<ProjectStatus, string> = {
  '問い合わせ': 'bg-slate-100 text-slate-600',
  '見積済':     'bg-blue-100 text-blue-700',
  '受注済':     'bg-indigo-100 text-indigo-700',
  '進行中':     'bg-amber-100 text-amber-700',
  '納品済':     'bg-cyan-100 text-cyan-700',
  '請求済':     'bg-purple-100 text-purple-700',
  '完了':       'bg-green-100 text-green-700',
};

export default function ProjectList() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const customerFilter = searchParams.get('customer_id') ? Number(searchParams.get('customer_id')) : undefined;

  const [page, setPage] = useState(() => {
    const p = Number(searchParams.get('page'));
    return Number.isFinite(p) && p > 0 ? p : 1;
  });
  const [search, setSearch] = useState(() => searchParams.get('q') ?? '');
  const [inputValue, setInputValue] = useState(() => searchParams.get('q') ?? '');
  const [sortKeys, setSortKeys] = useState<SortState[]>(() =>
    parseSortKeys(searchParams.get('sort'), searchParams.get('order')),
  );
  const isComposingRef = useRef(false);
  const { data: customers = [] } = useCustomers();
  const { settings } = useAppSettings();
  const filters = { ...(search ? { q: search } : {}), ...(customerFilter ? { customer_id: customerFilter } : {}) };
  const { data, isLoading, error } = useProjectsPaged(page, Object.keys(filters).length ? filters : undefined, sortKeys);
  const deleteMutation = useDeleteProject();
  const filterCustomer = customerFilter ? customers.find(c => c.id === customerFilter) : null;

  const projects = data?.data ?? [];
  const meta = data?.meta;

  // R-0091: ページ・検索語・ソートキーの状態をURLクエリへ反映し、リロード後も復元できるようにする
  function syncUrl(nextPage: number, nextSearch: string, nextSortKeys: SortState[]) {
    const next = new URLSearchParams();
    if (customerFilter) next.set('customer_id', String(customerFilter));
    if (nextPage > 1) next.set('page', String(nextPage));
    if (nextSearch) next.set('q', nextSearch);
    if (nextSortKeys.length > 0) {
      next.set('sort', nextSortKeys.map(s => s.key).join(','));
      next.set('order', nextSortKeys.map(s => s.dir).join(','));
    }
    setSearchParams(next, { replace: true });
  }

  function commitSearch(q: string) {
    setSearch(q);
    setPage(1);
    syncUrl(1, q, sortKeys);
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

  function handlePageChange(p: number) {
    setPage(p);
    syncUrl(p, search, sortKeys);
  }

  function handleMultiSortChange(keys: SortState[]) {
    setSortKeys(keys);
    setPage(1);
    syncUrl(1, search, keys);
  }

  if (isLoading) return <div className="p-6">読み込み中...</div>;
  if (error)     return <div className="p-6 text-red-600">エラー: {String(error)}</div>;

  const columns: DataTableColumn<Project>[] = [
    { key: 'project_code', label: '案件コード', sortable: true, render: p => p.project_code ?? '—' },
    { key: 'name', label: '案件名', sortable: true, render: p => p.name },
    { key: 'customer_name', label: '得意先', sortable: true, render: p => p.customer_name ?? `ID:${p.customer_id}` },
    {
      key: 'status',
      label: 'ステータス',
      sortable: true,
      render: p => (
        p.status && statusColor[p.status as ProjectStatus] ? (
          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${statusColor[p.status as ProjectStatus]}`}>
            {statusLabel[p.status as ProjectStatus]}
          </span>
        ) : (
          <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">
            {p.status}
          </span>
        )
      ),
    },
    { key: 'start_date', label: '開始日', sortable: true, render: p => p.start_date ?? '—' },
    { key: 'delivery_date', label: '納期', sortable: true, render: p => p.delivery_date ?? '—' },
    {
      key: 'effective_estimated_hours',
      label: '工数目安',
      render: p => (p.effective_estimated_hours != null
        ? `${(p.effective_estimated_hours / settings.hoursPerDay).toFixed(1)}日`
        : '—'),
    },
    {
      key: 'actions',
      label: '',
      width: 100,
      align: 'right',
      stopRowClick: true,
      render: p => (
        <>
          <button onClick={() => navigate(`/projects/${p.id}`)} className="px-2.5 py-1 bg-slate-500 text-white rounded text-xs mr-1 hover:bg-slate-600">編集</button>
          <button
            onClick={() => handleDelete(p.id, p.name)}
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
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold">案件一覧</h1>
          {filterCustomer && (
            <span className="text-sm text-slate-500 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
              {filterCustomer.name} の案件
            </span>
          )}
        </div>
        <button
          onClick={() => {
            const params = new URLSearchParams();
            if (customerFilter) params.set('customer_id', String(customerFilter));
            const qs = params.toString();
            navigate(`/projects/new${qs ? `?${qs}` : ''}`);
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700"
        >
          ＋ 新規登録
        </button>
      </div>

      <div className="mb-3">
        <input
          type="text"
          placeholder="案件名・得意先名で検索"
          value={inputValue}
          onChange={handleChange}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          className="px-3 py-1.5 border border-slate-300 rounded-md text-sm w-60"
        />
      </div>

      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <DataTable
          tableId="projects"
          columns={columns}
          rows={projects}
          rowKey={p => p.id}
          onRowClick={p => navigate(`/projects/${p.id}`)}
          multiSort
          sortKeys={sortKeys}
          onMultiSortChange={handleMultiSortChange}
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
