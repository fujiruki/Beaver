import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AppLayout, { getBuildTimeColor } from '../AppLayout';

vi.mock('react-router-dom', () => ({
  NavLink: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
  Outlet: () => <div />,
}));

vi.mock('../../../contexts/AppSettingsContext', () => ({
  useAppSettings: () => ({ settings: { fontSize: 16 } }),
}));

vi.mock('../../feedback/FeedbackModal', () => ({
  default: () => <button>feedback</button>,
}));

describe('getBuildTimeColor', () => {
  const buildTime = new Date('2026-08-07T00:00:00.000Z');

  it.each([
    ['30分後は目立つ色', 30 * 60 * 1000, '#4ade80'],
    ['2時間後は注意色', 2 * 60 * 60 * 1000, '#fbbf24'],
    ['25時間後は控えめな色', 25 * 60 * 60 * 1000, '#94a3b8'],
    ['1時間ちょうどは注意色', 60 * 60 * 1000, '#fbbf24'],
    ['24時間ちょうどは控えめな色', 24 * 60 * 60 * 1000, '#94a3b8'],
  ])('%s', (_label, elapsedMs, expected) => {
    expect(getBuildTimeColor(buildTime, new Date(buildTime.getTime() + elapsedMs))).toBe(expected);
  });
});

describe('AppLayout build time', () => {
  it('JSTで整形したビルド時刻を表示する', () => {
    render(<AppLayout />);

    expect(screen.getByText('ビルド: 2026-08-07 09:00')).toBeTruthy();
  });
});
