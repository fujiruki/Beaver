import { NavLink, Outlet } from 'react-router-dom';
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

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(intervalId);
  }, []);

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'sans-serif', fontSize: settings.fontSize }}>
      {/* サイドバー */}
      <nav style={{
        width: 180,
        background: '#1e293b',
        color: '#f1f5f9',
        flexShrink: 0,
        padding: '16px 0',
        display: 'flex',
        flexDirection: 'column',
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
      <main style={{ flex: 1, padding: 24, background: '#f8fafc' }}>
        <Outlet />
      </main>
    </div>
  );
}
