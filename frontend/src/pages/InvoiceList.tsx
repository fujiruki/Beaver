import { useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useInvoices } from '../api/invoices';
import { useCustomers } from '../api/customers';
import { useRestoreHistory } from '../api/history';
import { useBillingEditEnabled } from '../api/settings';
import DataTable, { useSortState } from '../components/DataTable';
import HistoryDrawer from '../components/history/HistoryDrawer';
import UndoToast from '../components/history/UndoToast';
import type { DataTableColumn, SortDir, SortState } from '../components/DataTable';
import type { Invoice } from '../types/invoice';

const MONTHS = ['1','2','3','4','5','6','7','8','9','10','11','12'];
const currentYear = String(new Date().getFullYear());
const YEARS = [currentYear, String(Number(currentYear) - 1), String(Number(currentYear) - 2)];

const NUMERIC_KEYS = new Set([
  'sales_total', 'tax_total', 'invoice_total', 'payment_received', 'next_carry_forward',
]);

function sortValue(inv: Invoice, key: string): number | string {
  if (NUMERIC_KEYS.has(key)) return Number(inv[key as keyof Invoice] ?? 0);
  return String(inv[key as keyof Invoice] ?? '');
}

interface LocationToastState {
  toast?: { message: string; historyId: number | null };
}

export default function InvoiceList() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showDeleteHistory, setShowDeleteHistory] = useState(false);
  const [deleteToast, setDeleteToast] = useState(
    () => (location.state as LocationToastState | null)?.toast ?? null,
  );
  const restoreMutation = useRestoreHistory();
  const { data: billingEditSetting } = useBillingEditEnabled();
  const billingEditEnabled = billingEditSetting?.billing_edit_enabled ?? false;

  async function handleUndoDelete() {
    if (!deleteToast?.historyId) return;
    await restoreMutation.mutateAsync(deleteToast.historyId);
    setDeleteToast(null);
  }
  const [year, setYear] = useState(() => searchParams.get('year') ?? currentYear);
  const [month, setMonth] = useState(() => searchParams.get('month') ?? String(new Date().getMonth() + 1));
  const [customerId, setCustomerId] = useState(() => searchParams.get('customer_id') ?? '');
  const [searchInput, setSearchInput] = useState(() => searchParams.get('q') ?? '');
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get('q') ?? '');
  const isComposingRef = useRef(false);
  const urlSortKey = searchParams.get('sort');
  const [sort, setSortStorage] = useSortState('invoices',
    urlSortKey ? { key: urlSortKey, dir: searchParams.get('order') === 'desc' ? 'desc' : 'asc' } : undefined);

  const { data: invoices = [], isLoading } = useInvoices({
    q: searchQuery || undefined,
    year: year || undefined,
    month: month || undefined,
    customer_id: customerId ? Number(customerId) : undefined,
  });
  const { data: customers = [] } = useCustomers();

  // R-0096: フィルタ・ソートの状態をURLクエリへ反映し、リロード後も復元できるようにする
  function syncUrl(next: { year: string; month: string; customerId: string; sort?: SortState }, nextSearch = searchQuery) {
    const params = new URLSearchParams();
    if (next.year) params.set('year', next.year);
    if (next.month) params.set('month', next.month);
    if (next.customerId) params.set('customer_id', next.customerId);
    if (nextSearch) params.set('q', nextSearch);
    if (next.sort) {
      params.set('sort', next.sort.key);
      params.set('order', next.sort.dir);
    }
    setSearchParams(params, { replace: true });
  }

  function commitSearch(value: string) {
    setSearchQuery(value);
    syncUrl({ year, month, customerId, sort }, value);
  }

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setSearchInput(value);
    if (!isComposingRef.current) commitSearch(value);
  }

  function handleYearChange(value: string) {
    setYear(value);
    syncUrl({ year: value, month, customerId, sort });
  }

  function handleMonthChange(value: string) {
    setMonth(value);
    syncUrl({ year, month: value, customerId, sort });
  }

  function handleCustomerIdChange(value: string) {
    setCustomerId(value);
    syncUrl({ year, month, customerId: value, sort });
  }

  function handleSortChange(key: string, dir: SortDir) {
    setSortStorage(key, dir);
    syncUrl({ year, month, customerId, sort: { key, dir } });
  }

  const totalInvoiced = invoices.reduce((s, i) => s + i.invoice_total, 0);
  const totalReceived = invoices.reduce((s, i) => s + i.payment_received, 0);
  const totalUnpaid   = invoices.reduce((s, i) => s + i.next_carry_forward, 0);

  const sortedInvoices = useMemo(() => {
    if (!sort) return invoices;
    const factor = sort.dir === 'asc' ? 1 : -1;
    return [...invoices].sort((a, b) => {
      const va = sortValue(a, sort.key);
      const vb = sortValue(b, sort.key);
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * factor;
      return String(va).localeCompare(String(vb), 'ja') * factor;
    });
  }, [invoices, sort]);

  const columns: DataTableColumn<Invoice>[] = [
    { key: 'invoice_no', label: '請求番号', sortable: true, render: i => i.invoice_no },
    { key: 'customer_name', label: '得意先', sortable: true, render: i => i.customer_name ?? '-' },
    { key: 'billing_date', label: '請求日', sortable: true, render: i => i.billing_date },
    { key: 'cutoff_date', label: '締め日', sortable: true, render: i => i.cutoff_date },
    { key: 'sales_total', label: '売上合計', align: 'right', sortable: true,
      render: i => `¥${i.sales_total.toLocaleString()}` },
    { key: 'tax_total', label: '消費税', align: 'right', sortable: true,
      render: i => `¥${i.tax_total.toLocaleString()}` },
    { key: 'invoice_total', label: '請求合計', align: 'right', sortable: true,
      render: i => <span style={{ fontWeight: 'bold' }}>¥{i.invoice_total.toLocaleString()}</span> },
    { key: 'payment_received', label: '入金額', align: 'right', sortable: true,
      render: i => <span style={{ color: '#10b981' }}>¥{i.payment_received.toLocaleString()}</span> },
    { key: 'next_carry_forward', label: '次月繰越', align: 'right', sortable: true,
      render: i => (
        <span style={{ color: i.next_carry_forward > 0 ? '#f59e0b' : '#64748b' }}>
          ¥{i.next_carry_forward.toLocaleString()}
        </span>
      ) },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 'bold' }}>請求一覧</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowDeleteHistory(true)} style={historyBtnStyle}>削除履歴</button>
          {billingEditEnabled && (
            <button onClick={() => navigate('/invoices/new')} style={newBtnStyle}>+ 新規請求書</button>
          )}
        </div>
      </div>

      {/* フィルタ */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, background: '#fff',
        padding: '12px 16px', borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', flexWrap: 'wrap' }}>
        <input
          value={searchInput}
          onChange={handleSearchChange}
          onCompositionStart={() => { isComposingRef.current = true; }}
          onCompositionEnd={e => { isComposingRef.current = false; commitSearch(e.currentTarget.value); }}
          placeholder="請求書番号・得意先で検索"
          style={{ ...filterStyle, minWidth: 260 }}
        />
        <select value={year} onChange={e => handleYearChange(e.target.value)} style={filterStyle}>
          {YEARS.map(y => <option key={y} value={y}>{y}年</option>)}
        </select>
        <select value={month} onChange={e => handleMonthChange(e.target.value)} style={filterStyle}>
          <option value="">月：すべて</option>
          {MONTHS.map(m => <option key={m} value={m}>{m}月</option>)}
        </select>
        <select value={customerId} onChange={e => handleCustomerIdChange(e.target.value)} style={filterStyle}>
          <option value="">得意先：すべて</option>
          {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {/* サマリー */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
        <SummaryCard label="請求合計" value={totalInvoiced} color="#2563eb" />
        <SummaryCard label="入金済" value={totalReceived} color="#10b981" />
        <SummaryCard label="未収残高" value={totalUnpaid} color="#f59e0b" />
      </div>

      {isLoading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>読み込み中...</div>
      ) : (
        <div style={{ background: '#fff', borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
          <DataTable
            tableId="invoices"
            columns={columns}
            rows={sortedInvoices}
            rowKey={i => i.id}
            onRowClick={i => navigate(`/invoices/${i.id}`)}
            sortKey={sort?.key}
            sortDir={sort?.dir}
            onSortChange={handleSortChange}
            emptyMessage="請求書がありません"
          />
        </div>
      )}

      <HistoryDrawer
        open={showDeleteHistory}
        onClose={() => setShowDeleteHistory(false)}
        entity="invoices"
        title="請求書の削除履歴"
      />

      {deleteToast && (
        <UndoToast
          message={deleteToast.message}
          pending={restoreMutation.isPending}
          onUndo={handleUndoDelete}
          onDismiss={() => setDeleteToast(null)}
        />
      )}
    </div>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ background: '#fff', borderRadius: 8, padding: '14px 18px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.08)', borderLeft: `4px solid ${color}` }}>
      <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 'bold', color }}>{`¥${value.toLocaleString()}`}</div>
    </div>
  );
}

const newBtnStyle: React.CSSProperties = {
  padding: '8px 18px', background: '#2563eb', color: '#fff', border: 'none',
  borderRadius: 6, cursor: 'pointer', fontSize: 14, fontWeight: 'bold',
};
const filterStyle: React.CSSProperties = {
  padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13,
};
const historyBtnStyle: React.CSSProperties = {
  padding: '8px 14px', background: '#fff', color: '#475569', border: '1px solid #cbd5e1',
  borderRadius: 6, cursor: 'pointer', fontSize: 14,
};
