import { NavLink, Outlet } from 'react-router-dom';
import { useAppSettings } from '../../contexts/AppSettingsContext';

const navItems = [
  { to: '/',           label: 'ダッシュボード' },
  { to: '/customers',  label: '得意先' },
  { to: '/projects',   label: '案件' },
  { to: '/vouchers',   label: '伝票' },
  { to: '/tategu',     label: '建具台帳' },
  { to: '/invoices',   label: '請求' },
  { to: '/settings/app', label: 'アプリ設定' },
  { to: '/help',       label: '? ヘルプ' },
];

export default function AppLayout() {
  const { settings } = useAppSettings();

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'sans-serif', fontSize: settings.fontSize }}>
      {/* サイドバー */}
      <nav style={{
        width: 180,
        background: '#1e293b',
        color: '#f1f5f9',
        flexShrink: 0,
        padding: '16px 0',
      }}>
        <div style={{ padding: '8px 16px 20px', fontWeight: 'bold', fontSize: 14, color: '#94a3b8' }}>
          Beaver
        </div>
        {navItems.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            style={({ isActive }) => ({
              display: 'block',
              padding: '10px 16px',
              color: isActive ? '#fff' : '#cbd5e1',
              background: isActive ? '#334155' : 'transparent',
              textDecoration: 'none',
              fontSize: 14,
            })}
          >
            {label}
          </NavLink>
        ))}
      </nav>

      {/* メインコンテンツ */}
      <main style={{ flex: 1, padding: 24, background: '#f8fafc' }}>
        <Outlet />
      </main>
    </div>
  );
}
