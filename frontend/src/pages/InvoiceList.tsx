import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useInvoices } from '../api/invoices';
import { useCustomers } from '../api/customers';

const MONTHS = ['1','2','3','4','5','6','7','8','9','10','11','12'];
const currentYear = String(new Date().getFullYear());
const YEARS = [currentYear, String(Number(currentYear) - 1), String(Number(currentYear) - 2)];

export default function InvoiceList() {
  const navigate = useNavigate();
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(String(new Date().getMonth() + 1));
  const [customerId, setCustomerId] = useState('');

  const { data: invoices = [], isLoading } = useInvoices({
    year: year || undefined,
    month: month || undefined,
    customer_id: customerId ? Number(customerId) : undefined,
  });
  const { data: customers = [] } = useCustomers();

  const totalInvoiced = invoices.reduce((s, i) => s + i.invoice_total, 0);
  const totalReceived = invoices.reduce((s, i) => s + i.payment_received, 0);
  const totalUnpaid   = invoices.reduce((s, i) => s + i.next_carry_forward, 0);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 'bold' }}>請求一覧</h1>
        <button onClick={() => navigate('/invoices/new')} style={newBtnStyle}>+ 新規請求書</button>
      </div>

      {/* フィルタ */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, background: '#fff',
        padding: '12px 16px', borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', flexWrap: 'wrap' }}>
        <select value={year} onChange={e => setYear(e.target.value)} style={filterStyle}>
          {YEARS.map(y => <option key={y} value={y}>{y}年</option>)}
        </select>
        <select value={month} onChange={e => setMonth(e.target.value)} style={filterStyle}>
          <option value="">月：すべて</option>
          {MONTHS.map(m => <option key={m} value={m}>{m}月</option>)}
        </select>
        <select value={customerId} onChange={e => setCustomerId(e.target.value)} style={filterStyle}>
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
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <Th>請求番号</Th>
                <Th>得意先</Th>
                <Th>請求日</Th>
                <Th>締め日</Th>
                <Th right>売上合計</Th>
                <Th right>消費税</Th>
                <Th right>請求合計</Th>
                <Th right>入金額</Th>
                <Th right>次月繰越</Th>
              </tr>
            </thead>
            <tbody>
              {invoices.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
                    請求書がありません
                  </td>
                </tr>
              ) : (
                invoices.map(inv => (
                  <tr key={inv.id} onClick={() => navigate(`/invoices/${inv.id}`)}
                    style={{ cursor: 'pointer', borderTop: '1px solid #f1f5f9' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f0f9ff')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}>
                    <Td>{inv.invoice_no}</Td>
                    <Td>{inv.customer_name ?? '-'}</Td>
                    <Td>{inv.billing_date}</Td>
                    <Td>{inv.cutoff_date}</Td>
                    <Td right>¥{inv.sales_total.toLocaleString()}</Td>
                    <Td right>¥{inv.tax_total.toLocaleString()}</Td>
                    <Td right bold>¥{inv.invoice_total.toLocaleString()}</Td>
                    <Td right color="#10b981">¥{inv.payment_received.toLocaleString()}</Td>
                    <Td right color={inv.next_carry_forward > 0 ? '#f59e0b' : '#64748b'}>
                      ¥{inv.next_carry_forward.toLocaleString()}
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
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

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th style={{ padding: '10px 12px', textAlign: right ? 'right' : 'left', fontSize: 12,
      color: '#64748b', fontWeight: 'bold', borderBottom: '1px solid #e2e8f0' }}>
      {children}
    </th>
  );
}

function Td({ children, right, bold, color }: {
  children: React.ReactNode; right?: boolean; bold?: boolean; color?: string;
}) {
  return (
    <td style={{ padding: '10px 12px', textAlign: right ? 'right' : 'left',
      fontWeight: bold ? 'bold' : 'normal', color: color ?? '#1e293b' }}>
      {children}
    </td>
  );
}

const newBtnStyle: React.CSSProperties = {
  padding: '8px 18px', background: '#2563eb', color: '#fff', border: 'none',
  borderRadius: 6, cursor: 'pointer', fontSize: 14, fontWeight: 'bold',
};
const filterStyle: React.CSSProperties = {
  padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13,
};
