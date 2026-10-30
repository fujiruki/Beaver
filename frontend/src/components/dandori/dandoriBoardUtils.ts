/**
 * 段取りボード（R-0111）画面固有の補助関数。
 * 案件単位の工数→バー期間計算は lib/dandoriCalc.ts に集約済みのためそちらを使う。
 * ここに置くのは画面のレイアウト・表示切替に関わる小さなロジックのみ。
 */
import type { ProjectSchedule } from '../../types/projectSchedule';
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

/** R-0146/R-0223: シームレススクロールでの延長日数。上限は設けない */
export function nextExtraDays(currentExtraDays: number, stepDays: number): number {
  return currentExtraDays + stepDays;
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

export interface ProductionSegment {
  scheduleId: number;
  start: string;
  end: string;
  hours: number | null;
  fixedEnd: string | null;
  done: boolean;
  unknownHours: boolean;
}

export interface DandoriBar {
  id: number;
  name: string;
  customerName: string;
  isShop: boolean;
  category: StatusCategory;
  status?: string;
  start: string;
  end: string;
  delivery: string | null;
  hours: number | null;
  salesBorderColor?: string;
  segments: ProductionSegment[];
  frame: { start: string; end: string } | null;
}

interface ProjectLike {
  id: number;
  name: string;
  customer_name?: string;
  status: string;
  delivery_date: string | null;
  effective_estimated_hours?: number | null;
}

type ScheduleDates = Pick<ProjectSchedule, 'start_date' | 'end_date'>;

function scheduleSpan(s: ScheduleDates): { start: string; end: string } | null {
  const start = s.start_date ?? s.end_date;
  const end = s.end_date ?? s.start_date;
  return start && end ? { start, end } : null;
}

type ScheduleOfProject = ScheduleDates & { project_id: number };

export function datedProjectIds(schedules: ScheduleOfProject[]): Set<number> {
  return new Set(schedules.filter(s => scheduleSpan(s)).map(s => s.project_id));
}

/** R-0222: 行に出ていない案件のうち、表示対象のもの（完了・キャンセル系はshowDoneに従う） */
export function unstartedProjects<T extends { id: number; status: string }>(
  projects: T[],
  showDone: boolean,
  excludeIds: Set<number> = new Set(),
): T[] {
  return projects.filter(
    p => !excludeIds.has(p.id) && (showDone || statusCategory(p.status) !== 'done'),
  );
}

/** R-0222: 日付のある予定（済も含む）が1つ以上ある案件。段取りに行を出す */
export function scheduledProjects<T extends { id: number; status: string }>(
  projects: T[],
  schedules: ScheduleOfProject[],
  showDone: boolean,
): T[] {
  const ids = datedProjectIds(schedules);
  return projects.filter(p => ids.has(p.id) && (showDone || statusCategory(p.status) !== 'done'));
}

/** R-0220/R-0222: 稼働数に数える区間。製作のバー（済でない）と、済でない取付の予定 */
export function loadIntervals(
  bars: { id: number; segments: ProductionSegment[] }[],
  schedules: ProjectSchedule[],
): { id: number; start: string; end: string }[] {
  const production = bars.flatMap(b =>
    b.segments.filter(g => !g.done).map(g => ({ id: b.id, start: g.start, end: g.end })),
  );
  const installs = schedules
    .filter(s => s.kind === '取付' && !s.done)
    .flatMap(s => {
      const span = scheduleSpan(s);
      return span ? [{ id: s.project_id, ...span }] : [];
    });
  return [...production, ...installs];
}

function buildSegments(
  schedules: ProjectSchedule[],
  projectHours: number | null,
  hoursPerDay: number,
): ProductionSegment[] {
  return schedules
    .filter(s => s.kind === '製作' && s.start_date)
    .map(s => {
      const start = s.start_date as string;
      const hours = s.hours ?? projectHours;
      return {
        scheduleId: s.id,
        start,
        end: s.end_date ?? barEndDate(start, workdaysFromHours(hours, hoursPerDay)),
        hours,
        fixedEnd: s.end_date,
        done: !!s.done,
        unknownHours: !hours,
      };
    });
}

function frameOf(
  schedules: ProjectSchedule[],
  segments: ProductionSegment[],
): { start: string; end: string } | null {
  const spans = [
    ...schedules.filter(s => !(s.kind === '製作' && s.start_date)).flatMap(s => scheduleSpan(s) ?? []),
    ...segments.map(g => ({ start: g.start, end: g.end })),
  ];
  if (spans.length === 0) return null;
  return {
    start: spans.reduce((min, x) => (x.start < min ? x.start : min), spans[0].start),
    end: spans.reduce((max, x) => (x.end > max ? x.end : max), spans[0].end),
  };
}

/** R-0222: 案件1つぶんの行。製作の予定ごとにバー（segments）、予定全体を囲む枠（frame）を持つ */
export function buildBar(project: ProjectLike, schedules: ProjectSchedule[], hoursPerDay: number): DandoriBar {
  const hours = project.effective_estimated_hours ?? null;
  const segments = buildSegments(schedules, hours, hoursPerDay);
  const frame = frameOf(schedules, segments);
  const barRange = segments.length > 0
    ? {
        start: segments.reduce((min, g) => (g.start < min ? g.start : min), segments[0].start),
        end: segments.reduce((max, g) => (g.end > max ? g.end : max), segments[0].end),
      }
    : frame;
  return {
    id: project.id,
    name: project.name,
    customerName: project.customer_name ?? '',
    isShop: (project.customer_name ?? '').includes('社内'),
    category: statusCategory(project.status),
    status: project.status,
    start: barRange?.start ?? '',
    end: barRange?.end ?? '',
    delivery: project.delivery_date,
    hours,
    segments,
    frame,
  };
}

/** 折り返しビュー用: 製作のバー1本ずつを別の行データにする */
export function expandSegments(bars: DandoriBar[]): DandoriBar[] {
  return bars.flatMap(b => b.segments.map(g => ({ ...b, start: g.start, end: g.end, hours: g.hours, segments: [g] })));
}

export type ProductionPlacement =
  | { type: 'update'; id: number; patch: { start_date: string } }
  | { type: 'create'; input: { kind: '製作'; start_date: string } };

/** R-0222: 未着手の「置く」。開始日の無い製作の予定があれば開始日を入れ、無ければ製作の予定を作る */
export function productionPlacement(
  schedules: { id: number; project_id: number; kind: string; start_date: string | null }[],
  projectId: number,
  date: string,
): ProductionPlacement {
  const open = schedules.find(s => s.project_id === projectId && s.kind === '製作' && !s.start_date);
  return open
    ? { type: 'update', id: open.id, patch: { start_date: date } }
    : { type: 'create', input: { kind: '製作', start_date: date } };
}

export function formatHours(hours: number): string {
  return String(Math.round(hours * 10) / 10);
}

/** R-0224: 「その他」で工程名があれば工程名、それ以外は種類名 */
export function scheduleKindName(s: { kind: string; name?: string }): string {
  return s.kind === 'その他' && s.name ? s.name : s.kind;
}

/** 「見積 2h」のように種類名の横に時間を出す */
export function scheduleLabel(s: { kind: string; name?: string; hours: number | null }): string {
  const kindName = scheduleKindName(s);
  return s.hours ? `${kindName} ${formatHours(s.hours)}h` : kindName;
}

/** R-0220/R-0222: やること一覧。日付（終了/期限、無ければ開始）順に並べ、日付の無い予定は一番下 */
export function todoSchedules<T extends { id: number; start_date: string | null; end_date: string | null; done: number }>(
  schedules: T[],
  showDone: boolean,
): T[] {
  const dateOf = (s: T) => s.end_date ?? s.start_date ?? '9999-99-99';
  return schedules
    .filter(s => showDone || !s.done)
    .sort((a, b) => dateOf(a).localeCompare(dateOf(b)) || a.id - b.id);
}

/** R-0220/R-0222: ドラッグで予定を動かしたときの新しい日付。ある日付だけを同じ日数動かす */
export function shiftScheduleDates(
  schedule: { start_date: string | null; end_date: string | null },
  deltaDays: number,
): { start_date?: string; end_date?: string } {
  return {
    ...(schedule.start_date ? { start_date: addDaysISO(schedule.start_date, deltaDays) } : {}),
    ...(schedule.end_date ? { end_date: addDaysISO(schedule.end_date, deltaDays) } : {}),
  };
}

export function isScheduleOverdue(schedule: { end_date: string | null; done: number }, todayISO: string): boolean {
  return !schedule.done && !!schedule.end_date && schedule.end_date < todayISO;
}
