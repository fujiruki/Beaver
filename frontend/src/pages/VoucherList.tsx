import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useVouchersPaged } from '../api/vouchers';
import { useCustomers } from '../api/customers';
import { useProjects } from '../api/projects';
import ComboSelect from '../components/ComboSelect';
import type { ComboOption } from '../components/ComboSelect';
import Pagination from '../components/Pagination';
import DataTable, { useSortState } from '../components/DataTable';
import type { DataTableColumn, SortDir, SortState } from '../components/DataTable';
import type { Voucher, VoucherType, VoucherStatus } from '../types/voucher';

const TYPE_LABELS: Record<VoucherType, string> = { estimate: '見積', sales: '売上' };
const STATUS_LABELS: Record<VoucherStatus, string> = {
  draft: '下書き', submitted: '提出済', approved: '承認済', billed: '請求済', void: '無効',
};
const STATUS_COLORS: Record<VoucherStatus, string> = {
  draft: '#94a3b8', submitted: '#3b82f6', approved: '#10b981', billed: '#8b5cf6', void: '#ef4444',
};

export default function VoucherList() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [page, setPage] = useState(() => {
    const p = Number(searchParams.get('page'));
    return Number.isFinite(p) && p > 0 ? p : 1;
  });
  const [typeFilter, setTypeFilter] = useState(() => searchParams.get('voucher_type') ?? '');
  const [statusFilter, setStatusFilter] = useState(() => searchParams.get('status') ?? '');
  const urlSortKey = searchParams.get('sort');
  const [sort, setSortStorage] = useSortState('vouchers',
    urlSortKey ? { key: urlSortKey, dir: searchParams.get('order') === 'desc' ? 'desc' : 'asc' } : undefined);
  const [customerFilter, setCustomerFilter] = useState<number | null>(
    searchParams.get('customer_id') ? Number(searchParams.get('customer_id')) : null
  );
  const [projectFilter, setProjectFilter] = useState<number | null>(
    searchParams.get('project_id') ? Number(searchParams.get('project_id')) : null
  );

  const { data: customers = [] } = useCustomers();
  const { data: projects = [] } = useProjects(customerFilter ? { customer_id: customerFilter } : undefined);

  const { data, isLoading } = useVouchersPaged(page, {
    voucher_type: typeFilter || undefined,
    status: statusFilter || undefined,
    customer_id: customerFilter ?? undefined,
    project_id: projectFilter ?? undefined,
  }, sort);

  const vouchers = data?.data ?? [];
  const meta = data?.meta;

  // R-0096: フィルタ・ページ・ソートの状態をURLクエリへ反映し、リロード後も復元できるようにする
  function syncUrl(next: {
    page: number;
    typeFilter: string;
    statusFilter: string;
    customerFilter: number | null;
    projectFilter: number | null;
    sort?: SortState;
  }) {
    const params = new URLSearchParams();
    if (next.customerFilter) params.set('customer_id', String(next.customerFilter));
    if (next.projectFilter) params.set('project_id', String(next.projectFilter));
    if (next.typeFilter) params.set('voucher_type', next.typeFilter);
    if (next.statusFilter) params.set('status', next.statusFilter);
    if (next.page > 1) params.set('page', String(next.page));
    if (next.sort) {
      params.set('sort', next.sort.key);
      params.set('order', next.sort.dir);
    }
    setSearchParams(params, { replace: true });
  }

  const customerOptions: ComboOption[] = customers.map(c => ({
    id: c.id,
    primaryText: c.name,
    searchText: [c.name, c.name_kana, c.tel, c.mobile, c.address1, c.address2, c.memo].filter(Boolean).join(' '),
  }));
  const projectOptions: ComboOption[] = projects.map(p => ({
    id: p.id,
    primaryText: p.name,
    secondaryText: p.customer_name ?? undefined,
    searchText: p.name,
  }));

  function handleTypeFilterChange(value: string) {
    setTypeFilter(value);
    setPage(1);
    syncUrl({ page: 1, typeFilter: value, statusFilter, customerFilter, projectFilter, sort });
  }

  function handleStatusFilterChange(value: string) {
    setStatusFilter(value);
    setPage(1);
    syncUrl({ page: 1, typeFilter, statusFilter: value, customerFilter, projectFilter, sort });
  }

  function handleCustomerChange(id: number | null) {
    setCustomerFilter(id);
    setProjectFilter(null);
    setPage(1);
    syncUrl({ page: 1, typeFilter, statusFilter, customerFilter: id, projectFilter: null, sort });
  }

  function handleProjectChange(id: number | null) {
    setProjectFilter(id);
    setPage(1);
    syncUrl({ page: 1, typeFilter, statusFilter, customerFilter, projectFilter: id, sort });
  }

  function handleSortChange(key: string, dir: SortDir) {
    setSortStorage(key, dir);
    setPage(1);
    syncUrl({ page: 1, typeFilter, statusFilter, customerFilter, projectFilter, sort: { key, dir } });
  }

  function handlePageChange(p: number) {
    setPage(p);
    syncUrl({ page: p, typeFilter, statusFilter, customerFilter, projectFilter, sort });
  }

  function handleNewVoucher() {
    const params = new URLSearchParams();
    if (projectFilter) params.set('project_id', String(projectFilter));
    if (customerFilter) params.set('customer_id', String(customerFilter));
    const qs = params.toString();
    navigate(`/vouchers/new${qs ? `?${qs}` : ''}`);
  }

  const columns: DataTableColumn<Voucher>[] = [
    { key: 'voucher_no', label: '伝票番号', sortable: true, render: v => v.voucher_no },
    { key: 'voucher_type', label: '種別', sortable: true, render: v => TYPE_LABELS[v.voucher_type] },
    {
      key: 'status',
      label: 'ステータス',
      sortable: true,
      render: v => (
        <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 12,
          background: STATUS_COLORS[v.status] + '20', color: STATUS_COLORS[v.status] }}>
          {STATUS_LABELS[v.status]}
        </span>
      ),
    },
    { key: 'customer_name', label: '得意先', sortable: true, render: v => v.customer_name ?? '-' },
    { key: 'description', label: '摘要', sortable: true, render: v => v.description ?? '-' },
    { key: 'project_name', label: '案件', sortable: true, render: v => v.project_name ?? '-' },
    { key: 'voucher_date', label: '伝票日付', sortable: true, render: v => v.voucher_date },
    {
      key: 'total_amount',
      label: '合計金額',
      align: 'right',
      sortable: true,
      render: v => `¥${v.total_amount.toLocaleString()}`,
    },
    {
      key: 'source_estimate_no',
      label: '引用',
      render: v => (
        v.voucher_type === 'sales' && v.source_estimate_no ? (
          <span style={{ padding: '2px 7px', borderRadius: 10, fontSize: 11,
            background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe' }}>
            引用: {v.source_estimate_no}
          </span>
        ) : null
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 'bold' }}>伝票一覧</h1>
        <button onClick={handleNewVoucher} style={newBtnStyle}>+ 新規伝票</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, marginBottom: 16, background: '#fff',
        padding: '12px 16px', borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', alignItems: 'end' }}>
        <div>
          <label style={filterLabelStyle}>得意先</label>
          <ComboSelect
            options={customerOptions}
            value={customerFilter}
            onChange={handleCustomerChange}
            placeholder="すべて"
          />
        </div>
        <div>
          <label style={filterLabelStyle}>案件</label>
          <ComboSelect
            options={projectOptions}
            value={projectFilter}
            onChange={handleProjectChange}
            placeholder="すべて"
          />
        </div>
        <div>
          <label style={filterLabelStyle}>種別</label>
          <select value={typeFilter} onChange={e => handleTypeFilterChange(e.target.value)} style={filterStyle}>
            <option value="">すべて</option>
            <option value="estimate">見積</option>
            <option value="sales">売上</option>
          </select>
        </div>
        <div>
          <label style={filterLabelStyle}>ステータス</label>
          <select value={statusFilter} onChange={e => handleStatusFilterChange(e.target.value)} style={filterStyle}>
            <option value="">すべて</option>
            <option value="draft">下書き</option>
            <option value="submitted">提出済</option>
            <option value="approved">承認済</option>
            <option value="billed">請求済</option>
            <option value="void">無効</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>読み込み中...</div>
      ) : (
        <div style={{ background: '#fff', borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
          <DataTable
            tableId="vouchers"
            columns={columns}
            rows={vouchers}
            rowKey={v => v.id}
            onRowClick={v => navigate(`/vouchers/${v.id}`)}
            sortKey={sort?.key}
            sortDir={sort?.dir}
            onSortChange={handleSortChange}
            emptyMessage="伝票がありません"
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
      )}
    </div>
  );
}

const newBtnStyle: React.CSSProperties = {
  padding: '8px 18px', background: '#2563eb', color: '#fff', border: 'none',
  borderRadius: 6, cursor: 'pointer', fontSize: 14, fontWeight: 'bold',
};
const filterStyle: React.CSSProperties = {
  width: '100%', padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13,
};
const filterLabelStyle: React.CSSProperties = {
  display: 'block', marginBottom: 4, fontSize: 12, fontWeight: 'bold', color: '#64748b',
};
