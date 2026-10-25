import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useProjectsPaged, useDeleteProject } from '../api/projects';
import { useCustomers } from '../api/customers';
import { useAppSettings } from '../contexts/AppSettingsContext';
import Pagination from '../components/Pagination';
import DataTable from '../components/DataTable';
import { useMultiSortState } from '../components/DataTable';
import type { DataTableColumn, SortState } from '../components/DataTable';
import YoukanLinkButton from '../components/YoukanLinkButton';
import type { Project, ProjectStatus } from '../types/project';
import { deadlineTierClassName, deadlineTierIcon, getDeadlineTier } from '../lib/dateHighlight';
import { useAssignVoucher, useUnlinkedVouchers, useVoucher } from '../api/vouchers';
import UndoToast from '../components/history/UndoToast';
import type { Voucher, VoucherType } from '../types/voucher';

// R-0091: sort=a,b&order=asc,desc 形式のURLクエリを複合ソートキー配列に変換する
// R-0116: URL・localStorageに未設定の新規ブラウザでは、ステータス（工程順）→納期の複合ソートを既定にする
const DEFAULT_SORT_KEYS: SortState[] = [{ key: 'status', dir: 'asc' }, { key: 'delivery_date', dir: 'asc' }];

function parseSortKeys(sortParam: string | null, orderParam: string | null): SortState[] {
  if (!sortParam) return DEFAULT_SORT_KEYS;
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
  'キャンセル': 'キャンセル',
};
const statusColor: Record<ProjectStatus, string> = {
  '問い合わせ': 'bg-slate-100 text-slate-600',
  '見積済':     'bg-blue-100 text-blue-700',
  '受注済':     'bg-indigo-100 text-indigo-700',
  '進行中':     'bg-amber-100 text-amber-700',
  '納品済':     'bg-cyan-100 text-cyan-700',
  '請求済':     'bg-purple-100 text-purple-700',
  '完了':       'bg-green-100 text-green-700',
  'キャンセル': 'bg-rose-100 text-rose-700',
};
// R-0147: ステータスフィルタボタンの並び順（工程順）はstatusLabelのキー順をそのまま使う
const ALL_STATUSES = Object.keys(statusLabel);

export default function ProjectList() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const customerFilter = searchParams.get('customer_id') ? Number(searchParams.get('customer_id')) : undefined;
  const statusFilter = searchParams.get('status') || undefined;
  const assignMode = searchParams.get('assign') === '1';
  const [undoVoucher, setUndoVoucher] = useState<Voucher | null>(null);
  const [assignedIds, setAssignedIds] = useState<Set<number>>(() => new Set());
  const assignMutation = useAssignVoucher();

  const [page, setPage] = useState(() => {
    const p = Number(searchParams.get('page'));
    return Number.isFinite(p) && p > 0 ? p : 1;
  });
  const [search, setSearch] = useState(() => searchParams.get('q') ?? '');
  const [inputValue, setInputValue] = useState(() => searchParams.get('q') ?? '');
  const [sortKeys, setSortKeys] = useMultiSortState('projects',
    parseSortKeys(searchParams.get('sort'), searchParams.get('order')),
  );
  const isComposingRef = useRef(false);
  const { data: customers = [] } = useCustomers();
  const { settings } = useAppSettings();
  const filters = {
    ...(search ? { q: search } : {}),
    ...(customerFilter ? { customer_id: customerFilter } : {}),
    ...(statusFilter ? { status: statusFilter } : {}),
  };
  const { data, isLoading, error } = useProjectsPaged(page, Object.keys(filters).length ? filters : undefined, sortKeys);
  const deleteMutation = useDeleteProject();
  const filterCustomer = customerFilter ? customers.find(c => c.id === customerFilter) : null;

  const projects = data?.data ?? [];
  const meta = data?.meta;

  // R-0091: ページ・検索語・ソートキーの状態をURLクエリへ反映し、リロード後も復元できるようにする
  function syncUrl(nextPage: number, nextSearch: string, nextSortKeys: SortState[], nextStatus: string | undefined) {
    const next = new URLSearchParams();
    if (customerFilter) next.set('customer_id', String(customerFilter));
    if (nextStatus) next.set('status', nextStatus);
    if (nextPage > 1) next.set('page', String(nextPage));
    if (nextSearch) next.set('q', nextSearch);
    if (nextSortKeys.length > 0) {
      next.set('sort', nextSortKeys.map(s => s.key).join(','));
      next.set('order', nextSortKeys.map(s => s.dir).join(','));
    }
    if (assignMode) next.set('assign', '1');
    setSearchParams(next, { replace: true });
  }

  function toggleAssignMode() {
    const next = new URLSearchParams(searchParams);
    if (assignMode) next.delete('assign');
    else next.set('assign', '1');
    setSearchParams(next);
  }

  async function assignVoucher(voucher: Voucher, project: Project) {
    if (voucher.customer_id && voucher.customer_id !== project.customer_id) {
      const ok = confirm(`得意先が違います（伝票: ${voucher.customer_name ?? '未設定'} ／ 案件: ${project.customer_name ?? '未設定'}）。この案件に入れますか`);
      if (!ok) return;
    }
    await assignMutation.mutateAsync({ voucherId: voucher.id, projectId: project.id });
    setAssignedIds(prev => new Set(prev).add(voucher.id));
    setUndoVoucher(voucher);
  }

  async function undoAssignment() {
    if (!undoVoucher) return;
    const voucher = undoVoucher;
    await assignMutation.mutateAsync({ voucherId: voucher.id, projectId: null });
    setAssignedIds(prev => {
      const next = new Set(prev);
      next.delete(voucher.id);
      return next;
    });
    setUndoVoucher(null);
  }

  function commitSearch(q: string) {
    setSearch(q);
    setPage(1);
    syncUrl(1, q, sortKeys, statusFilter);
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
    syncUrl(p, search, sortKeys, statusFilter);
  }

  function handleMultiSortChange(keys: SortState[]) {
    setSortKeys(keys);
    setPage(1);
    syncUrl(1, search, keys, statusFilter);
  }

  // R-0147: 単一選択のステータスフィルタ。選択中のボタンを再クリックすると解除して「すべて」に戻る
  function handleStatusFilterClick(status?: string) {
    const nextStatus = status && statusFilter !== status ? status : undefined;
    setPage(1);
    syncUrl(1, search, sortKeys, nextStatus);
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
    {
      key: 'delivery_date',
      label: '納期',
      sortable: true,
      render: p => {
        const tier = getDeadlineTier(p.delivery_date, new Date());
        return (
          <span className={deadlineTierClassName(tier)}>
            {deadlineTierIcon(tier)}{p.delivery_date ?? '—'}
          </span>
        );
      },
    },
    {
      key: 'effective_estimated_hours',
      align: 'right',
      label: '工数目安',
      render: p => (p.effective_estimated_hours != null
        ? `${(p.effective_estimated_hours / settings.hoursPerDay).toFixed(1)}日`
        : '—'),
    },
    {
      key: 'actions',
      label: '',
      width: 220,
      align: 'right',
      stopRowClick: true,
      render: p => (
        <>
          <YoukanLinkButton projectId={p.id} />
          <button onClick={() => navigate(`/projects/${p.id}`)} className="px-2.5 py-1 bg-slate-500 text-white rounded text-xs mr-1 ml-1 hover:bg-slate-600">編集</button>
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
            if (assignMode) params.set('assign', '1');
            const qs = params.toString();
            navigate(`/projects/new${qs ? `?${qs}` : ''}`);
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700"
        >
          ＋ 新規登録
        </button>
      </div>

      <div className="mb-3 flex justify-end">
        <button
          type="button"
          onClick={toggleAssignMode}
          className={`px-3 py-1.5 rounded-md text-sm border ${assignMode ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-slate-700 border-slate-300'}`}
        >
          {assignMode ? '割り当てを終了' : '伝票の割り当て'}
        </button>
      </div>

      <div className="mb-3 flex items-center justify-between flex-wrap gap-2">
        <input
          type="text"
          placeholder="案件名・得意先名で検索"
          value={inputValue}
          onChange={handleChange}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          className="px-3 py-1.5 border border-slate-300 rounded-md text-sm w-60"
        />
        <div className="flex flex-wrap gap-1.5" data-testid="status-filter-buttons">
          <button
            type="button"
            onClick={() => handleStatusFilterClick(undefined)}
            className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${
              !statusFilter ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-300'
            }`}
          >
            すべて
          </button>
          {ALL_STATUSES.map(s => (
            <button
              type="button"
              key={s}
              onClick={() => handleStatusFilterClick(s)}
              className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${
                statusFilter === s ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-300'
              }`}
            >
              {statusLabel[s]}
            </button>
          ))}
        </div>
      </div>

      <div className={assignMode ? 'grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(360px,2fr)]' : ''}>
      <div className="bg-white rounded-lg shadow-sm overflow-hidden min-w-0">
        <div className="md:hidden" data-testid="project-mobile-list">
          {projects.map(p => {
            const tier = getDeadlineTier(p.delivery_date, new Date());
            return (
              <div
                key={p.id}
                onDragOver={assignMode ? e => e.preventDefault() : undefined}
                onDrop={assignMode ? e => {
                  e.preventDefault();
                  const voucherId = Number(e.dataTransfer.getData('text/plain'));
                  const voucher = JSON.parse(e.dataTransfer.getData('application/x-beaver-voucher') || 'null') as Voucher | null;
                  if (voucher && voucher.id === voucherId) void assignVoucher(voucher, p);
                } : undefined}
                onClick={() => navigate(`/projects/${p.id}`)}
                className="p-3 border-b border-slate-100 last:border-0 cursor-pointer"
                style={{ minHeight: 44 }}
              >
                <div className="font-bold text-sm">
                  {p.name}
                  <span className="text-slate-400 text-xs font-mono ml-2">#{p.project_code ?? '—'}</span>
                </div>
                <div className="flex items-center gap-2 mt-1 text-sm text-slate-500">
                  <span>{p.customer_name ?? `ID:${p.customer_id}`}</span>
                  {p.status && statusColor[p.status as ProjectStatus] ? (
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${statusColor[p.status as ProjectStatus]}`}>
                      {statusLabel[p.status as ProjectStatus]}
                    </span>
                  ) : (
                    <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">
                      {p.status}
                    </span>
                  )}
                  <span className={deadlineTierClassName(tier)}>
                    {deadlineTierIcon(tier)}{p.delivery_date ?? '—'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="hidden md:block" data-testid="project-desktop-table">
          <DataTable
            tableId="projects"
            columns={columns}
            rows={projects}
            rowKey={p => p.id}
            onRowClick={p => navigate(`/projects/${p.id}`)}
            multiSort
            sortKeys={sortKeys}
            onMultiSortChange={handleMultiSortChange}
            getRowProps={assignMode ? p => ({
              'data-testid': `assign-project-${p.id}`,
              onDragOver: e => e.preventDefault(),
              onDrop: e => {
                e.preventDefault();
                const voucherId = Number(e.dataTransfer.getData('text/plain'));
                const voucher = JSON.parse(e.dataTransfer.getData('application/x-beaver-voucher') || 'null') as Voucher | null;
                if (voucher && voucher.id === voucherId) void assignVoucher(voucher, p);
              },
            }) : undefined}
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
      {assignMode && <UnlinkedVouchersPanel assignedIds={assignedIds} />}
      </div>
      {undoVoucher && (
        <UndoToast
          message={`${undoVoucher.voucher_no} を案件に割り当てました`}
          onUndo={() => void undoAssignment()}
          onDismiss={() => setUndoVoucher(null)}
          pending={assignMutation.isPending}
        />
      )}
    </div>
  );
}

function UnlinkedVouchersPanel({ assignedIds }: { assignedIds: Set<number> }) {
  const [type, setType] = useState<'all' | VoucherType>('all');
  const [search, setSearch] = useState('');
  const [detailVoucher, setDetailVoucher] = useState<Voucher | null>(null);
  const openedCardRef = useRef<HTMLElement | null>(null);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const suppressDoubleClickRef = useRef(false);
  const { data, isLoading, error, hasNextPage, fetchNextPage, isFetchingNextPage } = useUnlinkedVouchers({
    ...(type !== 'all' ? { voucher_type: type } : {}),
    ...(search.trim() ? { q: search.trim() } : {}),
  });
  const vouchers = useMemo(() => (data?.pages.flatMap(page => page.data) ?? []).filter(voucher => {
    if (assignedIds.has(voucher.id)) return false;
    if (type !== 'all' && voucher.voucher_type !== type) return false;
    const needle = search.trim().toLocaleLowerCase();
    if (!needle) return true;
    return [voucher.customer_name, voucher.description, voucher.voucher_no]
      .some(value => (value ?? '').toLocaleLowerCase().includes(needle));
  }), [assignedIds, data, search, type]);

  function openDetail(voucher: Voucher, card: HTMLElement) {
    if (detailVoucher) return;
    openedCardRef.current = card;
    setDetailVoucher(voucher);
  }

  function closeDetail() {
    setDetailVoucher(null);
    requestAnimationFrame(() => openedCardRef.current?.focus());
  }

  useEffect(() => {
    if (!detailVoucher) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeDetail();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [detailVoucher]);

  return (
    <aside className="relative bg-white rounded-lg shadow-sm p-4 min-w-0 overflow-hidden" data-testid="unlinked-vouchers-panel">
      <h2 className="font-bold mb-3">未割り当て伝票</h2>
      <div className="flex gap-1 mb-2">
        {([['all', '両方'], ['estimate', '見積'], ['sales', '売上']] as const).map(([value, label]) => (
          <button key={value} type="button" onClick={() => setType(value)}
            className={`px-3 py-1 rounded-full text-xs border ${type === value ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-300'}`}>
            {label}
          </button>
        ))}
      </div>
      <input
        type="search"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="得意先・摘要・伝票番号で検索"
        className="w-full px-3 py-1.5 mb-3 border border-slate-300 rounded-md text-sm"
      />
      {isLoading && <p className="text-sm text-slate-500">読み込み中...</p>}
      {error && <p className="text-sm text-red-600">伝票を読み込めませんでした</p>}
      <div className="space-y-2">
        {vouchers.map(voucher => (
          <div
            key={voucher.id}
            draggable
            tabIndex={0}
            data-testid={`unlinked-voucher-${voucher.id}`}
            onPointerDown={e => {
              pointerStartRef.current = { x: e.clientX, y: e.clientY };
            }}
            onPointerMove={e => {
              const start = pointerStartRef.current;
              if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 4) {
                suppressDoubleClickRef.current = true;
              }
            }}
            onPointerUp={() => {
              pointerStartRef.current = null;
            }}
            onDoubleClick={e => {
              if (suppressDoubleClickRef.current) {
                suppressDoubleClickRef.current = false;
                return;
              }
              openDetail(voucher, e.currentTarget);
            }}
            onKeyDown={e => {
              if (e.key === 'Enter') openDetail(voucher, e.currentTarget);
            }}
            onDragStart={e => {
              suppressDoubleClickRef.current = true;
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', String(voucher.id));
              e.dataTransfer.setData('application/x-beaver-voucher', JSON.stringify(voucher));
            }}
            className="border border-slate-200 rounded-md p-3 cursor-grab active:cursor-grabbing hover:border-blue-400"
          >
            <div className="flex justify-between gap-2 text-sm font-semibold">
              <span>{voucher.voucher_date}</span>
              <span>{voucher.voucher_no}</span>
              <span className="text-xs text-slate-500">{voucher.voucher_type === 'estimate' ? '見積' : '売上'}</span>
            </div>
            <div className="text-sm mt-1">{voucher.customer_name ?? '得意先未設定'}</div>
            <div className="text-xs text-slate-500 truncate">{voucher.description ?? '摘要なし'}</div>
            <div className="text-sm text-right mt-1">¥{Number(voucher.total_amount ?? 0).toLocaleString()}</div>
          </div>
        ))}
        {!isLoading && vouchers.length === 0 && <p className="text-sm text-slate-500 py-4 text-center">該当する伝票はありません</p>}
      </div>
      {hasNextPage && (
        <button type="button" onClick={() => void fetchNextPage()} disabled={isFetchingNextPage}
          className="mt-3 w-full px-3 py-2 border border-slate-300 rounded-md text-sm">
          {isFetchingNextPage ? '読み込み中...' : 'もっと見る'}
        </button>
      )}
      {detailVoucher && (
        <>
          <button
            type="button"
            aria-label="詳細を閉じる"
            data-testid="voucher-drawer-backdrop"
            onClick={closeDetail}
            className="absolute inset-0 z-10 h-full w-full cursor-default bg-slate-900/20"
          />
          <VoucherDetailDrawer voucherSummary={detailVoucher} onClose={closeDetail} />
        </>
      )}
    </aside>
  );
}

function VoucherDetailDrawer({ voucherSummary, onClose }: { voucherSummary: Voucher; onClose: () => void }) {
  const { data: voucher, isLoading, error, refetch, isFetching } = useVoucher(voucherSummary.id);
  const shownVoucher = voucher ?? voucherSummary;
  const status = shownVoucher.status;

  return (
    <section
      role="dialog"
      aria-modal="true"
      aria-labelledby="voucher-detail-title"
      className="absolute inset-y-0 right-0 z-20 flex h-full w-full min-w-0 flex-col border-l border-slate-300 bg-white shadow-2xl"
    >
      <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="voucher-detail-title" className="text-lg font-bold text-slate-900">{shownVoucher.voucher_no}</h2>
          <span className="rounded border border-slate-300 px-2 py-0.5 text-xs font-semibold text-slate-700">
            {shownVoucher.voucher_type === 'estimate' ? '見積' : '売上'}
          </span>
          {status === 'void' && <span className="rounded border border-slate-500 px-2 py-0.5 text-xs font-semibold">取消</span>}
          {(status === 'billed' || shownVoucher.access_billed_flag === 1) && (
            <span className="rounded border border-slate-400 px-2 py-0.5 text-xs font-semibold">請求済み</span>
          )}
        </div>
        <button type="button" onClick={onClose} aria-label="閉じる" className="rounded p-1 text-xl leading-none text-slate-500 hover:bg-slate-100">×</button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-4">
        {isLoading && (
          <div aria-label="伝票詳細を読み込み中" className="space-y-4">
            <div className="h-16 animate-pulse rounded bg-slate-100" />
            <div className="h-10 w-4/5 animate-pulse rounded bg-slate-100" />
            <div className="h-40 animate-pulse rounded bg-slate-100" />
          </div>
        )}

        {error && !voucher && (
          <div className="rounded border border-slate-300 p-4 text-sm">
            <p className="mb-3 text-red-700">伝票の詳細を読み込めませんでした</p>
            <button type="button" onClick={() => void refetch()} disabled={isFetching} className="rounded border border-slate-300 px-3 py-1.5 hover:bg-slate-50">
              {isFetching ? '再試行中...' : '再試行'}
            </button>
          </div>
        )}

        {voucher && (
          <>
            {status === 'void' && <p className="mb-4 border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-semibold">取消済みの伝票です</p>}
            <dl className="grid grid-cols-2 border border-slate-200 text-sm">
              <div className="min-h-16 border-r border-slate-200 p-3">
                <dt className="mb-1 text-xs text-slate-500">得意先</dt>
                <dd className="font-semibold text-slate-900">{voucher.customer_name ?? '得意先未設定'}</dd>
              </div>
              <div className="min-h-16 p-3">
                <dt className="mb-1 text-xs text-slate-500">日付</dt>
                <dd className="font-semibold text-slate-900">{voucher.voucher_date}</dd>
              </div>
            </dl>

            <div className="border-x border-b border-slate-200 p-3 text-sm">
              <div className="mb-1 text-xs text-slate-500">摘要</div>
              <div className="font-medium text-slate-900">{voucher.description ?? '—'}</div>
            </div>

            <div className="mt-5 flex items-center justify-between border-b border-slate-300 pb-2">
              <h3 className="font-bold">明細</h3>
              <span className="text-xs text-slate-500">全{voucher.lines.length}件</span>
            </div>
            <div className="max-h-80 overflow-y-auto border-x border-b border-slate-300">
              {voucher.lines.length === 0 ? (
                <p className="p-6 text-center text-sm text-slate-500">明細はありません</p>
              ) : voucher.lines.map(line => (
                <div key={line.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-slate-200 p-3 last:border-b-0">
                  <div className="min-w-0">
                    <div className="break-words text-sm font-semibold text-slate-900">{line.item_name ?? '品名未設定'}</div>
                    <div className="mt-1 text-xs text-slate-500">{line.location_name ?? '取付場所なし'} / {Number(line.quantity).toLocaleString()}</div>
                  </div>
                  <div className="self-center whitespace-nowrap text-right text-sm font-semibold">¥{Number(line.line_total ?? 0).toLocaleString()}</div>
                </div>
              ))}
            </div>

            <div className="mt-4 text-sm">
              <div className="mb-1 text-xs text-slate-500">備考</div>
              <p className="whitespace-pre-wrap text-slate-700">{voucher.memo ?? '—'}</p>
            </div>

            <div className="mt-5 border-t border-slate-500 pt-3 text-right text-lg font-bold">
              合計　¥{Number(voucher.total_amount ?? 0).toLocaleString()}
            </div>
          </>
        )}
      </div>

      <footer className="flex items-center justify-between border-t border-slate-200 px-5 py-3">
        <Link to={`/vouchers/${voucherSummary.id}`} className="text-sm text-blue-700 underline underline-offset-2">伝票画面で開く</Link>
        <span className="text-xs text-slate-400">Escでも閉じる</span>
      </footer>
    </section>
  );
}
