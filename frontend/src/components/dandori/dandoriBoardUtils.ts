/**
 * 段取りボード（R-0111）画面固有の補助関数。
 * 案件単位の工数→バー期間計算は lib/dandoriCalc.ts に集約済みのためそちらを使う。
 * ここに置くのは画面のレイアウト・表示切替に関わる小さなロジックのみ。
 */
import { freeDayMarkers, workdaysFromHours, barEndDate, dailyLoad } from '../../lib/dandoriCalc';

export type RangePreset = '8w' | '6m' | '1y';
export type ViewMode = 'scroll' | 'wrap';
export type StatusCategory = 'notstarted' | 'working' | 'done';

// project_statuses マスタの実際の名称（2026-08-24時点、api/database.sqlite確認済み）
// 問い合わせ・見積済・受注済 = 未着手系（点線） / 進行中・納品済・請求済 = 着手中系（塗り） / 完了・キャンセル = 既定非表示
const NOT_STARTED_STATUSES = new Set(['問い合わせ', '見積済', '受注済']);
const HIDDEN_STATUSES = new Set(['完了', 'キャンセル']);

export function statusCategory(status: string): StatusCategory {
  if (HIDDEN_STATUSES.has(status)) return 'done';
  if (NOT_STARTED_STATUSES.has(status)) return 'notstarted';
  return 'working';
}

function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function toISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function daysBetween(startISO: string, endISO: string): number {
  return Math.round((parseISO(endISO).getTime() - parseISO(startISO).getTime()) / 86400000);
}

export function addDaysISO(iso: string, days: number): string {
  return toISO(new Date(parseISO(iso).getTime() + days * 86400000));
}

/** isoを含む週の月曜日 */
export function mondayOfWeek(iso: string): string {
  const day = parseISO(iso).getUTCDay(); // 0=日,1=月,...,6=土
  const diff = day === 0 ? -6 : 1 - day;
  return addDaysISO(iso, diff);
}

export function formatMD(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${Number(m)}/${Number(d)}`;
}

export function todayISOLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const PRESET_DAYS: Record<RangePreset, number> = { '8w': 56, '6m': 183, '1y': 366 };
export const PRESET_DEFAULT_PX_PER_DAY: Record<RangePreset, number> = { '8w': 24, '6m': 6, '1y': 3 };
export const PRESET_LABELS: Record<RangePreset, string> = { '8w': '8週間', '6m': '6ヶ月', '1y': '1年' };

/** 表示期間: 今日を含む週の月曜の2週間前 〜 プリセット日数ぶん先 */
export function rangeForPreset(todayISO: string, preset: RangePreset): { start: string; end: string } {
  const start = addDaysISO(mondayOfWeek(todayISO), -14);
  const end = addDaysISO(start, PRESET_DAYS[preset] - 1);
  return { start, end };
}

/**
 * freeDayMarkers（先頭日のみ）の結果に、連続2日以上の空きかどうかのラベルを付与する。
 * 単発1日の空きは「M/D 空き」、2日以上続く空きは「M/D から空き」と表示する（モック仕様）。
 */
export function freeMarkerLabels(load: Map<string, number>, todayISO: string): { date: string; label: string }[] {
  const entries = [...load.entries()];
  const indexByDate = new Map(entries.map(([d], i) => [d, i]));
  return freeDayMarkers(load, todayISO).map(date => {
    const idx = indexByDate.get(date);
    const next = idx !== undefined ? entries[idx + 1] : undefined;
    const multi = next ? next[1] === 0 : false;
    return { date, label: multi ? `${formatMD(date)} から空き` : `${formatMD(date)} 空き` };
  });
}

/**
 * 今日以降で稼働0の最初の平日を返す（F3）。全バー終了後で空きが無ければ最終バー翌営業日、
 * バーが無ければ今日（今日が土日なら次の月曜）相当になる。
 */
export function nextFreeDay(bars: { start: string; end: string }[], todayISO: string): string {
  const maxEnd = bars.reduce((max, b) => (b.end > max ? b.end : max), todayISO);
  const rangeEnd = addDaysISO(maxEnd, 7); // 全バー終了後にも必ず平日が1つ入るバッファ
  const load = dailyLoad(bars, todayISO, rangeEnd);
  return freeDayMarkers(load, todayISO)[0] ?? todayISO;
}

export function isWeekendISO(iso: string): boolean {
  const day = parseISO(iso).getUTCDay();
  return day === 0 || day === 6;
}

export function enumerateDays(startISO: string, endISO: string): string[] {
  const days: string[] = [];
  for (let cur = startISO; cur <= endISO; cur = addDaysISO(cur, 1)) days.push(cur);
  return days;
}

/** 表示範囲内の月境界（左端の月ラベル＋以降の月初めごとの区切り線） */
export function monthBoundaries(startISO: string, endISO: string): { date: string; label: string; isEdge: boolean }[] {
  const result: { date: string; label: string; isEdge: boolean }[] = [{ date: startISO, label: `${Number(startISO.slice(5, 7))}月`, isEdge: true }];
  for (const day of enumerateDays(startISO, endISO)) {
    if (day.slice(8, 10) === '01' && day !== startISO) {
      result.push({ date: day, label: `${Number(day.slice(5, 7))}月`, isEdge: false });
    }
  }
  return result;
}

export interface DandoriBar {
  id: number;
  name: string;
  customerName: string;
  isShop: boolean;
  category: StatusCategory;
  start: string;
  end: string;
  delivery: string | null;
  hours: number | null;
  unknownHours: boolean;
}

interface ProjectLike {
  id: number;
  name: string;
  customer_name?: string;
  status: string;
  start_date: string;
  delivery_date: string | null;
  effective_estimated_hours?: number | null;
}

/** 開始日未設定の案件のうち、表示対象のもの（完了・キャンセル系はshowDoneに従う） */
export function unstartedProjects<T extends { start_date: string | null; status: string }>(
  projects: T[],
  showDone: boolean,
): T[] {
  return projects.filter(p => !p.start_date && (showDone || statusCategory(p.status) !== 'done'));
}

export function buildBar(project: ProjectLike, hoursPerDay: number): DandoriBar {
  const hours = project.effective_estimated_hours ?? null;
  const workdays = workdaysFromHours(hours, hoursPerDay);
  return {
    id: project.id,
    name: project.name,
    customerName: project.customer_name ?? '',
    isShop: (project.customer_name ?? '').includes('社内'),
    category: statusCategory(project.status),
    start: project.start_date,
    end: barEndDate(project.start_date, workdays),
    delivery: project.delivery_date,
    hours,
    unknownHours: !hours,
  };
}
