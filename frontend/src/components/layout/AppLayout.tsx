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
  { to: '/',           icon: '📊', label: 'ダッシュボード' },
  { to: '/customers',  icon: '👥', label: '得意先' },
  { to: '/projects',   icon: '📁', label: '案件' },
  { to: '/dandori',    icon: '📅', label: '段取り' },
  { to: '/vouchers',   icon: '🧾', label: '伝票' },
  { to: '/tategu',     icon: '🚪', label: '建具台帳' },
  { to: '/invoices',   icon: '💰', label: '請求' },
  { to: '/settings/app', icon: '⚙️', label: 'アプリ設定' },
  { to: '/help',       icon: '❓', label: 'ヘルプ' },
];

function isNavItemActive(pathname: string, item: { to: string }): boolean {
  return item.to === '/' ? pathname === '/' : pathname.startsWith(item.to);
}

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
    const current = navItems.find(item => isNavItemActive(location.pathname, item));
    document.title = current ? `${current.label} - Beaver` : 'Beaver';
  }, [location.pathname]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', fontFamily: 'sans-serif', fontSize: settings.fontSize }}>
      {/* PC向けヘッダー（R-0139） */}
      <header
        className="hidden md:flex"
        style={{
          alignItems: 'center', gap: 20,
          padding: '0 24px', height: 56, flexShrink: 0,
          background: '#1e293b', color: '#f1f5f9',
        }}
      >
        <span style={{ fontWeight: 'bold', fontSize: 14, color: '#94a3b8' }}>Beaver</span>
        <nav style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {navItems.map((item, index) => {
            const active = isNavItemActive(location.pathname, item);
            return (
              <div key={item.to} style={{ display: 'flex', alignItems: 'center' }}>
                {index > 0 && (
                  <span
                    aria-hidden="true"
                    data-testid="nav-divider"
                    style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.12)', margin: '0 4px' }}
                  />
                )}
                <NavLink
                  to={item.to}
                  end={item.to === '/'}
                  className={active ? undefined : 'transition-colors duration-150 hover:bg-white/10'}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '8px 12px', borderRadius: 6,
                    color: active ? '#fff' : '#cbd5e1',
                    background: active ? '#334155' : undefined,
                    textDecoration: 'none', fontSize: 13, whiteSpace: 'nowrap',
                  }}
                >
                  {item.icon} {item.label}
                </NavLink>
              </div>
            );
          })}
        </nav>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14 }}>
          {me && (
            <>
              <span style={{ fontSize: 13, color: '#cbd5e1' }}>{me.name}</span>
              <button
                onClick={handleLogout}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: 12, cursor: 'pointer', padding: 0 }}
              >
                ログアウト
              </button>
            </>
          )}
          <FeedbackModal />
          <span style={{ fontSize: 11, color: getBuildTimeColor(buildTime, now) }}>
            ビルド: {formatBuildTime(buildTime)}
          </span>
        </div>
      </header>

      {/* スマホ向けヘッダーバー */}
      <div
        className="flex md:hidden"
        style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 30,
          alignItems: 'center', gap: 12,
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

      <div style={{ display: 'flex', flex: 1 }}>
        {/* サイドバー（モバイル専用、R-0139でPC表示時は非表示） */}
        <nav
          className={`fixed inset-y-0 left-0 z-50 flex md:hidden ${navOpen ? 'translate-x-0' : '-translate-x-full'}`}
          style={{
            width: 180,
            background: '#1e293b',
            color: '#f1f5f9',
            flexShrink: 0,
            padding: '16px 0',
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
        <main className="pt-14 md:pt-0" style={{ flex: 1, minWidth: 0, paddingLeft: 24, paddingRight: 24, paddingBottom: 24, background: '#f8fafc' }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
