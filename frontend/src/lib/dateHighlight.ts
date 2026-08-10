export type DeadlineTier = 'overdue' | 'within3d' | 'within1w' | 'within2w' | 'within1m' | 'normal';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parseDateOnly(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

function calendarDayNumber(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / MS_PER_DAY;
}

function diffDaysFromToday(dateStr: string | null | undefined, now: Date): number | null {
  const date = parseDateOnly(dateStr);
  if (!date || Number.isNaN(now.getTime())) return null;

  return calendarDayNumber(date) - calendarDayNumber(now);
}

export function getDeadlineTier(
  dateStr: string | null | undefined,
  now: Date,
): DeadlineTier {
  const diffDays = diffDaysFromToday(dateStr, now);
  if (diffDays === null) return 'normal';
  if (diffDays < 0) return 'overdue';
  if (diffDays <= 3) return 'within3d';
  if (diffDays <= 7) return 'within1w';
  if (diffDays <= 14) return 'within2w';
  if (diffDays <= 30) return 'within1m';
  return 'normal';
}

export function deadlineTierClassName(tier: DeadlineTier): string {
  const classNames: Record<DeadlineTier, string> = {
    overdue: 'text-red-700 font-bold',
    within3d: 'text-orange-600 font-semibold',
    within1w: 'text-amber-600',
    within2w: 'text-yellow-700',
    within1m: 'text-slate-600 font-medium',
    normal: '',
  };

  return classNames[tier];
}

export function deadlineTierIcon(tier: DeadlineTier): string {
  return tier === 'overdue' ? '⚠ ' : '';
}

export function isRecentVoucherDate(
  dateStr: string | null | undefined,
  now: Date,
): boolean {
  const diffDays = diffDaysFromToday(dateStr, now);
  return diffDays !== null && diffDays <= 0 && diffDays >= -30;
}
