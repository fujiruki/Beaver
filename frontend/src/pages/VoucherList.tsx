import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useVouchersPaged } from '../api/vouchers';
import { useCustomers } from '../api/customers';
import { useProjects } from '../api/projects';
import ComboSelect from '../components/ComboSelect';
import type { ComboOption } from '../components/ComboSelect';
import Pagination from '../components/Pagination';
import type { VoucherType, VoucherStatus } from '../types/voucher';

const TYPE_LABELS: Record<VoucherType, string> = { estimate: '見積', sales: '売上' };
const STATUS_LABELS: Record<VoucherStatus, string> = {
  draft: '下書き', submitted: '提出済', approved: '承認済', billed: '請求済', void: '無効',
};
const STATUS_COLORS: Record<VoucherStatus, string> = {
  draft: '#94a3b8', submitted: '#3b82f6', approved: '#10b981', billed: '#8b5cf6', void: '#ef4444',
};

export default function VoucherList() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
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
  });

  const vouchers = data?.data ?? [];
  const meta = data?.meta;

  const customerOptions: ComboOption[] = customers.map(c => ({
    id: c.id,
    primaryText: c.name,
    searchText: [c.name, c.name_kana].filter(Boolean).join(' '),
  }));
  const projectOptions: ComboOption[] = projects.map(p => ({
    id: p.id,
    primaryText: p.name,
    secondaryText: p.customer_name ?? undefined,
    searchText: p.name,
  }));

  function handleFilterChange(setter: (v: string) => void, value: string) {
    setter(value);
    setPage(1);
  }

  function handleCustomerChange(id: number | null) {
    setCustomerFilter(id);
    setProjectFilter(null);
    setPage(1);
  }

  function handleProjectChange(id: number | null) {
    setProjectFilter(id);
    setPage(1);
  }

  function handleNewVoucher() {
    const params = new URLSearchParams();
    if (projectFilter) params.set('project_id', String(projectFilter));
    if (customerFilter) params.set('customer_id', String(customerFilter));
    const qs = params.toString();
    navigate(`/vouchers/new${qs ? `?${qs}` : ''}`);
  }

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
          <select value={typeFilter} onChange={e => handleFilterChange(setTypeFilter, e.target.value)} style={filterStyle}>
            <option value="">すべて</option>
            <option value="estimate">見積</option>
            <option value="sales">売上</option>
          </select>
        </div>
        <div>
          <label style={filterLabelStyle}>ステータス</label>
          <select value={statusFilter} onChange={e => handleFilterChange(setStatusFilter, e.target.value)} style={filterStyle}>
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
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <Th>伝票番号</Th>
                <Th>種別</Th>
                <Th>ステータス</Th>
                <Th>得意先</Th>
                <Th>案件</Th>
                <Th>摘要</Th>
                <Th>伝票日付</Th>
                <Th right>合計金額</Th>
              </tr>
            </thead>
            <tbody>
              {vouchers.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
                    伝票がありません
                  </td>
                </tr>
              ) : (
                vouchers.map(v => (
                  <tr key={v.id} onClick={() => navigate(`/vouchers/${v.id}`)}
                    style={{ cursor: 'pointer', borderTop: '1px solid #f1f5f9' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f0f9ff')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}>
                    <Td>{v.voucher_no}</Td>
                    <Td>{TYPE_LABELS[v.voucher_type]}</Td>
                    <Td>
                      <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 12,
                        background: STATUS_COLORS[v.status] + '20',
                        color: STATUS_COLORS[v.status] }}>
                        {STATUS_LABELS[v.status]}
                      </span>
                    </Td>
                    <Td>{v.customer_name ?? '-'}</Td>
                    <Td>{v.project_name ?? '-'}</Td>
                    <Td>{v.description ?? '-'}</Td>
                    <Td>{v.voucher_date}</Td>
                    <Td right>¥{v.total_amount.toLocaleString()}</Td>
                  </tr>
                ))
              )}
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
      )}
    </div>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th style={{ padding: '10px 14px', textAlign: right ? 'right' : 'left', fontSize: 12,
      color: '#64748b', fontWeight: 'bold', borderBottom: '1px solid #e2e8f0' }}>
      {children}
    </th>
  );
}

function Td({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <td style={{ padding: '10px 14px', textAlign: right ? 'right' : 'left', color: '#1e293b' }}>
      {children}
    </td>
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
