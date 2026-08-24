/**
 * 段取りボード（R-0111）の純粋計算ロジック。
 * 日付はすべてYYYY-MM-DD文字列で受け渡す。タイムゾーン差の影響を避けるため
 * 内部計算はUTC固定のDateで行う。
 */

function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function toISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86400000);
}

function isWeekend(date: Date): boolean {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

/** 工数(h)→営業日数。ceil、最低1。hoursがnull/0でも1 */
export function workdaysFromHours(hours: number | null, hoursPerDay: number): number {
  if (hoursPerDay <= 0) return 1;
  if (!hours) return 1;
  return Math.max(1, Math.ceil(hours / hoursPerDay));
}

/**
 * startISOから営業日workdays日ぶんを消化した最終日。土日スキップ。
 * 開始が土日なら次の月曜から消化を開始する。
 */
export function barEndDate(startISO: string, workdays: number): string {
  let current = parseISO(startISO);
  while (isWeekend(current)) current = addDays(current, 1);

  const target = Math.max(1, workdays);
  let count = 1;
  while (count < target) {
    current = addDays(current, 1);
    if (!isWeekend(current)) count++;
  }
  return toISO(current);
}

/** 範囲内の平日ごとの稼働案件数。keyはYYYY-MM-DD */
export function dailyLoad(
  bars: { start: string; end: string }[],
  rangeStart: string,
  rangeEnd: string,
): Map<string, number> {
  const load = new Map<string, number>();
  const end = parseISO(rangeEnd);
  let current = parseISO(rangeStart);
  while (current.getTime() <= end.getTime()) {
    if (!isWeekend(current)) {
      const iso = toISO(current);
      const count = bars.filter(b => b.start <= iso && iso <= b.end).length;
      load.set(iso, count);
    }
    current = addDays(current, 1);
  }
  return load;
}

/** 今日以降の稼働0平日のうち、連続区間の先頭日リスト */
export function freeDayMarkers(load: Map<string, number>, todayISO: string): string[] {
  const markers: string[] = [];
  let prevWasFree = false;
  for (const [dateISO, count] of load) {
    if (dateISO < todayISO) {
      prevWasFree = false;
      continue;
    }
    if (count === 0) {
      if (!prevWasFree) markers.push(dateISO);
      prevWasFree = true;
    } else {
      prevWasFree = false;
    }
  }
  return markers;
}
