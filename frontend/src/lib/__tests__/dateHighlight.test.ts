import { describe, expect, it } from 'vitest';
import {
  deadlineTierClassName,
  deadlineTierIcon,
  getDeadlineTier,
  isRecentVoucherDate,
  type DeadlineTier,
} from '../dateHighlight';

const now = new Date(2026, 7, 10, 15, 30);

describe('getDeadlineTier', () => {
  it.each([
    ['2026-08-09', 'overdue'],
    ['2026-08-10', 'within3d'],
    ['2026-08-13', 'within3d'],
    ['2026-08-14', 'within1w'],
    ['2026-08-17', 'within1w'],
    ['2026-08-18', 'within2w'],
    ['2026-08-24', 'within2w'],
    ['2026-08-25', 'within1m'],
    ['2026-09-09', 'within1m'],
    ['2026-09-10', 'normal'],
  ] as const)('%s is classified as %s', (dateStr, expected) => {
    expect(getDeadlineTier(dateStr, now)).toBe(expected);
  });

  it.each([null, undefined, '', 'not-a-date'])('returns normal for invalid value %s', value => {
    expect(getDeadlineTier(value, now)).toBe('normal');
  });
});

describe('deadline tier presentation', () => {
  const expected: Record<DeadlineTier, { className: string; icon: string }> = {
    overdue: { className: 'text-red-700 font-bold', icon: '⚠ ' },
    within3d: { className: 'text-orange-600 font-semibold', icon: '' },
    within1w: { className: 'text-amber-600', icon: '' },
    within2w: { className: 'text-yellow-700', icon: '' },
    within1m: { className: 'text-slate-600 font-medium', icon: '' },
    normal: { className: '', icon: '' },
  };

  it.each(Object.entries(expected) as [DeadlineTier, { className: string; icon: string }][]) (
    'returns the expected presentation for %s',
    (tier, presentation) => {
      expect(deadlineTierClassName(tier)).toBe(presentation.className);
      expect(deadlineTierIcon(tier)).toBe(presentation.icon);
    },
  );
});

describe('isRecentVoucherDate', () => {
  it.each([
    ['2026-07-11', true],
    ['2026-07-10', false],
    ['2026-08-10', true],
    ['2026-08-11', false],
    ['', false],
    ['not-a-date', false],
  ] as const)('returns %s for %s', (dateStr, expected) => {
    expect(isRecentVoucherDate(dateStr, now)).toBe(expected);
  });

  it.each([null, undefined])('returns false for %s', value => {
    expect(isRecentVoucherDate(value, now)).toBe(false);
  });
});
