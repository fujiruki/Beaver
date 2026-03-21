import { useNavigate } from 'react-router-dom';
import { useVouchers } from '../api/vouchers';
import { useInvoices } from '../api/invoices';
import { useCustomers } from '../api/customers';
import { useProjects } from '../api/projects';
import type { Project } from '../types/project';

const ACTIVE_STATUSES = ['受注済', '進行中'];
const PENDING_STATUSES = ['問い合わせ', '見積済'];

export default function Dashboard() {
  const navigate = useNavigate();
  const currentYear  = String(new Date().getFullYear());
  const currentMonth = String(new Date().getMonth() + 1);

  const { data: customers = [] } = useCustomers();
  const { data: monthInvoices = [] } = useInvoices({ year: currentYear, month: currentMonth });
  const { data: approvedVouchers = [] } = useVouchers({ status: 'approved' });
  const { data: allProjects = [] } = useProjects();

  const monthSales   = monthInvoices.reduce((s, i) => s + i.invoice_total, 0);
  const activeProjects  = allProjects.filter(p => ACTIVE_STATUSES.includes(p.status));
  const pendingProjects = allProjects.filter(p => PENDING_STATUSES.includes(p.status));

  return (
    <div>
      <h1 style={{ margin: '0 0 20px', fontSize: 20, fontWeight: 'bold' }}>ダッシュボード</h1>

      {/* KPIカード */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
        <KpiCard
          label={`${currentMonth}月 売上合計`}
          value={`¥${monthSales.toLocaleString()}`}
          sub="請求ベース"
          color="#2563eb"
          onClick={() => navigate('/invoices')}
        />
        <KpiCard
          label="進行中の案件"
          value={String(activeProjects.length)}
          sub="受注済・進行中"
          color="#10b981"
          onClick={() => navigate('/projects')}
        />
        <KpiCard
          label="未受注の案件"
          value={String(pendingProjects.length)}
          sub="問い合わせ・見積済"
          color="#f59e0b"
          onClick={() => navigate('/projects')}
        />
        <KpiCard
          label="承認済（未請求）"
          value={String(approvedVouchers.length)}
          sub="件"
          color="#7c3aed"
          onClick={() => navigate('/vouchers')}
        />
      </div>

      {/* クイックアクション */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
        <ActionBtn label="+ 見積を作成" color="#2563eb" onClick={() => navigate('/vouchers/new')} />
        <ActionBtn label="+ 案件を登録" color="#10b981" onClick={() => navigate('/projects/new')} />
        <ActionBtn label="+ 請求書を作成" color="#7c3aed" onClick={() => navigate('/invoices/new')} />
      </div>

      {/* 案件リスト 2列 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <ProjectList
          title="進行中の案件"
          projects={activeProjects}
          accentColor="#10b981"
          emptyMessage="進行中の案件はありません"
          onRowClick={id => navigate(`/projects/${id}`)}
        />
        <ProjectList
          title="未受注の案件"
          projects={pendingProjects}
          accentColor="#f59e0b"
          emptyMessage="未受注の案件はありません"
          onRowClick={id => navigate(`/projects/${id}`)}
        />
      </div>

      {/* 得意先数フッター */}
      <div style={{ fontSize: 13, color: '#94a3b8', textAlign: 'right' }}>
        登録得意先数: {customers.length} 社
      </div>
    </div>
  );
}

function ProjectList({ title, projects, accentColor, emptyMessage, onRowClick }: {
  title: string;
  projects: Project[];
  accentColor: string;
  emptyMessage: string;
  onRowClick: (id: number) => void;
}) {
  return (
    <div style={{ background: '#fff', borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      borderTop: `4px solid ${accentColor}`, overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 8 }}>
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 'bold', color: '#475569' }}>{title}</h2>
        <span style={{ fontSize: 12, padding: '1px 8px', borderRadius: 10,
          background: accentColor + '20', color: accentColor, fontWeight: 'bold' }}>
          {projects.length}
        </span>
      </div>
      {projects.length === 0 ? (
        <div style={{ padding: '20px 16px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
          {emptyMessage}
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f8fafc' }}>
              <Th>案件名</Th>
              <Th>得意先</Th>
              <Th>ステータス</Th>
              <Th>納期</Th>
            </tr>
          </thead>
          <tbody>
            {projects.map(p => (
              <tr key={p.id}
                onClick={() => onRowClick(p.id)}
                style={{ borderTop: '1px solid #f1f5f9', cursor: 'pointer' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                onMouseLeave={e => (e.currentTarget.style.background = '')}>
                <Td>
                  <span style={{ fontWeight: 500 }}>{p.name}</span>
                  <span style={{ color: '#94a3b8', fontSize: 11, marginLeft: 6, fontFamily: 'monospace' }}>
                    {p.project_code}
                  </span>
                </Td>
                <Td>{p.customer_name ?? '-'}</Td>
                <Td>
                  <StatusBadge status={p.status} />
                </Td>
                <Td>{p.delivery_date ?? '-'}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const STATUS_COLOR: Record<string, string> = {
  '問い合わせ': '#94a3b8',
  '見積済':     '#f59e0b',
  '受注済':     '#3b82f6',
  '進行中':     '#10b981',
  '納品済':     '#8b5cf6',
  '請求済':     '#6366f1',
  '完了':       '#64748b',
};

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLOR[status] ?? '#94a3b8';
  return (
    <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 11,
      background: color + '20', color }}>
      {status}
    </span>
  );
}

function KpiCard({ label, value, sub, color, onClick }: {
  label: string; value: string; sub: string; color: string; onClick: () => void;
}) {
  return (
    <div onClick={onClick}
      style={{ background: '#fff', borderRadius: 8, padding: '16px 18px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)', borderTop: `4px solid ${color}`, cursor: 'pointer' }}
      onMouseEnter={e => ((e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.12)')}
      onMouseLeave={e => ((e.currentTarget as HTMLDivElement).style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)')}>
      <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 'bold', color, marginBottom: 2 }}>{value}</div>
      <div style={{ fontSize: 12, color: '#94a3b8' }}>{sub}</div>
    </div>
  );
}

function ActionBtn({ label, color, onClick }: { label: string; color: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      style={{ padding: '8px 16px', background: color, color: '#fff',
        border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 'bold' }}>
      {label}
    </button>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th style={{ padding: '7px 10px', textAlign: 'left', fontSize: 11,
      color: '#64748b', fontWeight: 'bold', borderBottom: '1px solid #e2e8f0' }}>
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return (
    <td style={{ padding: '8px 10px', color: '#1e293b' }}>
      {children}
    </td>
  );
}
