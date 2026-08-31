import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAppSettings } from '../../contexts/AppSettingsContext';
import { useMe } from '../../api/me';
import FeedbackModal from '../feedback/FeedbackModal';

function handleLogout() {
  const redirect = encodeURIComponent(window.location.href);
  window.location.href = `https://door-fujita.com/contents/auth/logout?redirect=${redirect}`;
}

const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;

export function getBuildTimeColor(buildTime: Date, now: Date): string {
  const elapsedMs = now.getTime() - buildTime.getTime();
  if (elapsedMs < ONE_HOUR_MS) return '#4ade80';
  if (elapsedMs < ONE_DAY_MS) return '#fbbf24';
  return '#94a3b8';
}

function formatBuildTime(buildTime: Date): string {
  const parts = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(buildTime);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')} ${value('hour')}:${value('minute')}`;
}

const navItems = [
  { to: '/',           label: 'ダッシュボード' },
  { to: '/customers',  label: '得意先' },
  { to: '/projects',   label: '案件' },
  { to: '/dandori',    label: '段取り' },
  { to: '/vouchers',   label: '伝票' },
  { to: '/tategu',     label: '建具台帳' },
  { to: '/invoices',   label: '請求' },
  { to: '/settings/app', label: 'アプリ設定' },
  { to: '/help',       label: '? ヘルプ' },
];

export default function AppLayout() {
  const { settings } = useAppSettings();
  const { data: me } = useMe();
  const buildTime = new Date(__BUILD_TIME__);
  const [now, setNow] = useState(() => new Date());
  const [navOpen, setNavOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    // R-0112: タブ名が「frontend」等になり分かりづらい問題への対応
    const current = navItems.find(item => item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to));
    document.title = current ? `${current.label} - Beaver` : 'Beaver';
  }, [location.pathname]);

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'sans-serif', fontSize: settings.fontSize }}>
      {/* スマホ向けヘッダーバー */}
      <div
        className="md:hidden"
        style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 30,
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '10px 16px', background: '#1e293b', color: '#f1f5f9',
        }}
      >
        <button
          aria-label="メニューを開閉"
          aria-expanded={navOpen}
          onClick={() => setNavOpen(o => !o)}
          style={{ background: 'transparent', border: 'none', color: '#f1f5f9', fontSize: 22, cursor: 'pointer', padding: 0 }}
        >
          ☰
        </button>
        <span style={{ fontWeight: 'bold', fontSize: 14 }}>Beaver</span>
      </div>

      {navOpen && (
        <div
          className="md:hidden"
          data-testid="sidebar-overlay"
          onClick={() => setNavOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 40 }}
        />
      )}

      {/* サイドバー */}
      <nav
        className={`fixed inset-y-0 left-0 z-50 md:static md:z-auto md:translate-x-0 ${navOpen ? 'translate-x-0' : '-translate-x-full'}`}
        style={{
          width: 180,
          background: '#1e293b',
          color: '#f1f5f9',
          flexShrink: 0,
          padding: '16px 0',
          display: 'flex',
          flexDirection: 'column',
          transition: 'transform 0.2s',
        }}
      >
        <div style={{ padding: '8px 16px 20px', fontWeight: 'bold', fontSize: 14, color: '#94a3b8' }}>
          Beaver
        </div>
        {navItems.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            onClick={() => setNavOpen(false)}
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

        <div style={{ marginTop: 'auto' }}>
          {me && (
            <div style={{ padding: '10px 16px 0', fontSize: 13, color: '#cbd5e1' }}>
              <div>{me.name}</div>
              <button
                onClick={handleLogout}
                style={{
                  marginTop: 4,
                  background: 'transparent',
                  border: 'none',
                  color: '#94a3b8',
                  fontSize: 12,
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                ログアウト
              </button>
            </div>
          )}
          <div style={{ padding: '16px 16px 0' }}>
            <FeedbackModal />
          </div>
          <div style={{ padding: '10px 16px 0', fontSize: 11, color: getBuildTimeColor(buildTime, now) }}>
            ビルド: {formatBuildTime(buildTime)}
          </div>
        </div>
      </nav>

      {/* メインコンテンツ */}
      <main className="pt-14 md:pt-0" style={{ flex: 1, minWidth: 0, padding: 24, background: '#f8fafc' }}>
        <Outlet />
      </main>
    </div>
  );
}
