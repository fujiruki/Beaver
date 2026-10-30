import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { dailyLoad } from '../../lib/dandoriCalc';
import { APP_STORAGE_PREFIX } from '../../lib/appId';
import {
  addDaysISO,
  daysBetween,
  enumerateDays,
  formatMD,
  isWeekendISO,
  monthBoundaries,
  freeMarkerLabels,
  loadIntervals,
  scheduleKindName,
  scheduleLabel,
  shiftScheduleDates,
  formatHours,
  type DandoriBar,
  type ProductionSegment,
} from './dandoriBoardUtils';
import type { ProjectSchedule } from '../../types/projectSchedule';

const DETAIL_THRESHOLD_PX = 12; // これ未満は日付数字を消して月境界表示にする
const LABEL_THRESHOLD_PX = 10;  // これ未満はバー内ラベルを消す

// R-0138: 案件名列・得意先名列の幅
const LABEL_WIDTHS_STORAGE_KEY = `${APP_STORAGE_PREFIX}dandori_label_widths`;
const NAME_COL_MIN_WIDTH = 60;
const CUST_COL_MIN_WIDTH = 60;
const LABEL_TOTAL_MIN_WIDTH = NAME_COL_MIN_WIDTH + CUST_COL_MIN_WIDTH;
const DEFAULT_NAME_COL_WIDTH = 160;
const DEFAULT_LABEL_TOTAL_WIDTH = 240;

interface LabelWidths {
  name: number;
  total: number;
}

function loadLabelWidths(): LabelWidths {
  const defaults: LabelWidths = { name: DEFAULT_NAME_COL_WIDTH, total: DEFAULT_LABEL_TOTAL_WIDTH };
  try {
    const raw = localStorage.getItem(LABEL_WIDTHS_STORAGE_KEY);
    if (!raw) return defaults;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return defaults;
    const name = (parsed as Record<string, unknown>).name;
    const total = (parsed as Record<string, unknown>).total;
    return {
      name: typeof name === 'number' && Number.isFinite(name) ? name : defaults.name,
      total: typeof total === 'number' && Number.isFinite(total) ? total : defaults.total,
    };
  } catch {
    return defaults;
  }
}

function clampLabelWidths(name: number, total: number): LabelWidths {
  const clampedTotal = Math.max(LABEL_TOTAL_MIN_WIDTH, total);
  const clampedName = Math.min(Math.max(NAME_COL_MIN_WIDTH, name), clampedTotal - CUST_COL_MIN_WIDTH);
  return { name: clampedName, total: clampedTotal };
}

/** R-0138: 案件名列/得意先名列の境界・ラベル全体/ガント本体の境界の2つのドラッグハンドルを扱う */
function useLabelWidths() {
  const [widths, setWidths] = useState<LabelWidths>(() => {
    const loaded = loadLabelWidths();
    return clampLabelWidths(loaded.name, loaded.total);
  });

  const persist = useCallback((next: LabelWidths) => {
    try {
      localStorage.setItem(LABEL_WIDTHS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // localStorage が使えない環境（プライベートモード等）では保存を諦める
    }
  }, []);

  const startDrag = useCallback((e: React.PointerEvent, axis: 'name' | 'total') => {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const startWidths = widths;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    let latest = startWidths;

    function handleMove(ev: PointerEvent) {
      const delta = ev.clientX - startX;
      latest = axis === 'name'
        ? clampLabelWidths(startWidths.name + delta, startWidths.total)
        : clampLabelWidths(startWidths.name, startWidths.total + delta);
      setWidths(latest);
    }

    function handleUp() {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      persist(latest);
    }

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  }, [widths, persist]);

  return {
    nameColWidth: widths.name,
    custColWidth: widths.total - widths.name,
    labelTotalWidth: widths.total,
    onNameHandleDown: (e: React.PointerEvent) => startDrag(e, 'name'),
    onTotalHandleDown: (e: React.PointerEvent) => startDrag(e, 'total'),
  };
}

function gridBgStyle(pxPerDay: number): React.CSSProperties {
  const cycle = 7 * pxPerDay;
  const weekendStart = 5 * pxPerDay;
  const images = [`repeating-linear-gradient(to right, transparent 0 ${weekendStart}px, rgba(138,129,119,0.10) ${weekendStart}px ${cycle}px)`];
  if (pxPerDay >= DETAIL_THRESHOLD_PX) {
    images.push(`repeating-linear-gradient(to right, var(--line) 0 1px, transparent 1px ${pxPerDay}px)`);
  }
  return { backgroundImage: images.join(', ') };
}

const CHAR_WIDTH_PX = 13; // 14px太字1文字あたりの概算幅（和文基準、余裕を持たせた概算）
const LABEL_PADDING_PX = 20; // .bar の左右padding分

/** F5: 厳密なmeasureTextは使わず文字数×概算幅でバー内に収まるか判定する */
export function estimateLabelWidth(text: string): number {
  return text.length * CHAR_WIDTH_PX + LABEL_PADDING_PX;
}

function barClassName(bar: DandoriBar, segment: ProductionSegment): string {
  const done = bar.category === 'done' || segment.done;
  const category = done ? 'done' : bar.category === 'notstarted' ? 'notstarted' : 'working';
  return ['bar', category, bar.isShop && !done ? 'shop' : '', segment.unknownHours ? 'unknown-hours' : '', bar.salesBorderColor ? 'has-sales-border' : '', bar.salesBorderColor === '#ffffff' ? 'sales-border-white' : ''].filter(Boolean).join(' ');
}

function TodayCol({ leftPx, pxPerDay, label }: { leftPx: number | null; pxPerDay: number; label?: boolean }) {
  if (leftPx === null) return null;
  return (
    <>
      <div className="today-col" style={{ left: leftPx, width: pxPerDay }} />
      {label && <span className="today-label" style={{ left: leftPx, width: pxPerDay }}>今日</span>}
    </>
  );
}

/** バーの水平ドラッグ→start_date変更、納期線ドラッグ→delivery_date変更。1日スナップでドロップ時に確定する */
function useDayDrag(pxPerDay: number, onCommit: (deltaDays: number) => void) {
  const [dragPx, setDragPx] = useState<number | null>(null);
  const startXRef = useRef(0);

  const handlers = {
    onPointerDown(e: React.PointerEvent) {
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      startXRef.current = e.clientX;
      setDragPx(0);
    },
    onPointerMove(e: React.PointerEvent) {
      if (dragPx === null) return;
      setDragPx(e.clientX - startXRef.current);
    },
    onPointerUp(e: React.PointerEvent) {
      if (dragPx === null) return;
      e.currentTarget.releasePointerCapture(e.pointerId);
      const deltaDays = Math.round(dragPx / pxPerDay);
      setDragPx(null);
      if (deltaDays !== 0) onCommit(deltaDays);
    },
  };
  const deltaDays = dragPx === null ? 0 : Math.round(dragPx / pxPerDay);
  return { handlers, dragOffsetPx: deltaDays * pxPerDay, isDragging: dragPx !== null };
}

const NEAR_RIGHT_EDGE_THRESHOLD_PX = 400; // R-0146: 残りがこの幅未満でonNearRightEdgeを呼ぶ
const NEAR_LEFT_EDGE_THRESHOLD_PX = 400;

interface GanttScrollProps {
  bars: DandoriBar[];
  rangeStart: string;
  rangeEnd: string;
  pxPerDay: number;
  todayISO: string;
  onCommit: (id: number, patch: { delivery_date?: string }) => void;
  onProjectDoubleClick: (id: number) => void;
  onNearRightEdge?: () => void;
  onNearLeftEdge?: () => void;
  statusOptions?: string[];
  onStatusChange?: (id: number, status: string) => void;
  schedules?: ProjectSchedule[];
  onScheduleMove?: (id: number, patch: { start_date?: string; end_date?: string }) => void;
  onAddSchedule?: (projectId: number) => void;
}

export default function GanttScroll({
  bars, rangeStart, rangeEnd, pxPerDay, todayISO, onCommit, onProjectDoubleClick,
  onNearRightEdge, onNearLeftEdge, statusOptions = [], onStatusChange,
  schedules = [], onScheduleMove, onAddSchedule,
}: GanttScrollProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const widthBeforePrependRef = useRef<number | null>(null);
  const [contextMenu, setContextMenu] = useState<{ id: number; status?: string; x: number; y: number } | null>(null);
  const totalDays = daysBetween(rangeStart, rangeEnd) + 1;
  const gridWidth = totalDays * pxPerDay;
  const showDayNumbers = pxPerDay >= DETAIL_THRESHOLD_PX;
  const showBarLabel = pxPerDay >= LABEL_THRESHOLD_PX;
  const todayInRange = todayISO >= rangeStart && todayISO <= rangeEnd;
  const todayLeftPx = todayInRange ? daysBetween(rangeStart, todayISO) * pxPerDay : null;
  const { nameColWidth, custColWidth, labelTotalWidth, onNameHandleDown, onTotalHandleDown } = useLabelWidths();

  const sortedBars = [...bars].sort((a, b) => a.start.localeCompare(b.start));
  const visibleProjectIds = new Set(bars.map(b => b.id));
  const visibleSchedules = schedules.filter(s => visibleProjectIds.has(s.project_id));
  const load = dailyLoad(
    loadIntervals(sortedBars, visibleSchedules),
    rangeStart,
    rangeEnd,
  );
  const markers = freeMarkerLabels(load, todayISO);
  const loadDays = enumerateDays(rangeStart, rangeEnd);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    const previousWidth = widthBeforePrependRef.current;
    if (!el || previousWidth === null) return;
    el.scrollLeft += el.scrollWidth - previousWidth;
    widthBeforePrependRef.current = null;
  }, [rangeStart]);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [contextMenu]);

  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    const remainingPx = el.scrollWidth - (el.scrollLeft + el.clientWidth);
    if (onNearRightEdge && remainingPx < NEAR_RIGHT_EDGE_THRESHOLD_PX) onNearRightEdge();
    if (onNearLeftEdge && el.scrollLeft < NEAR_LEFT_EDGE_THRESHOLD_PX && widthBeforePrependRef.current === null) {
      widthBeforePrependRef.current = el.scrollWidth;
      onNearLeftEdge();
    }
  }

  return (
    <div ref={scrollRef} className="gantt-scroll" onScroll={handleScroll}>
      <div className="gantt" style={{ width: labelTotalWidth + gridWidth }}>
        <div className="axis">
          <div className="label-col" style={{ width: labelTotalWidth }}>
            <div className="name-col" style={{ width: nameColWidth, textAlign: 'left' }}>
              案件名
              <div className="resize-handle resize-handle-name" onPointerDown={onNameHandleDown} />
            </div>
            <div className="cust-col" style={{ width: custColWidth, textAlign: 'left' }}>
              得意先
            </div>
            <div className="resize-handle resize-handle-total" onPointerDown={onTotalHandleDown} />
          </div>
          <div className="grid-col" style={{ width: gridWidth }}>
            <div className="grid-bg" style={gridBgStyle(pxPerDay)} />
            <TodayCol leftPx={todayLeftPx} pxPerDay={pxPerDay} label />
            {showDayNumbers ? (
              <>
                {loadDays.map((d, i) =>
                  i % 7 === 0 ? (
                    <span key={d} className="week" style={{ left: i * pxPerDay + 4 }}>{formatMD(d)}</span>
                  ) : null,
                )}
                <div className="day-nums">
                  {loadDays.map(d => (
                    <i key={d} className={isWeekendISO(d) ? 'we' : ''} style={{ flex: `0 0 ${pxPerDay}px` }}>{Number(d.slice(8, 10))}</i>
                  ))}
                </div>
              </>
            ) : (
              monthBoundaries(rangeStart, rangeEnd).map(m => (
                <span key={m.date}>
                  {!m.isEdge && <div className="month-line" style={{ left: daysBetween(rangeStart, m.date) * pxPerDay }} />}
                  <span className="month-label" style={{ left: daysBetween(rangeStart, m.date) * pxPerDay + 4 }}>{m.label}</span>
                </span>
              ))
            )}
          </div>
        </div>

        {sortedBars.map(bar => (
          <BarRow
            key={bar.id}
            bar={bar}
            rangeStart={rangeStart}
            pxPerDay={pxPerDay}
            gridWidth={gridWidth}
            showBarLabel={showBarLabel}
            todayLeftPx={todayLeftPx}
            schedules={visibleSchedules.filter(s => s.project_id === bar.id)}
            onScheduleMove={onScheduleMove}
            nameColWidth={nameColWidth}
            custColWidth={custColWidth}
            labelTotalWidth={labelTotalWidth}
            onCommit={onCommit}
            onProjectDoubleClick={onProjectDoubleClick}
            onContextMenu={(event, status) => {
              event.preventDefault();
              setContextMenu({ id: bar.id, status, x: event.clientX, y: event.clientY });
            }}
          />
        ))}

        <div className="load-row">
          <div className="label-col" style={{ width: labelTotalWidth }}>1日の稼働案件数</div>
          <div className="grid-col" style={{ width: gridWidth }}>
            <div className="grid-bg" style={gridBgStyle(pxPerDay)} />
            <TodayCol leftPx={todayLeftPx} pxPerDay={pxPerDay} />
            <div className="load-bars">
              {loadDays.map(d => {
                const count = load.get(d);
                return (
                  <i key={d} style={{ flex: `0 0 ${pxPerDay}px` }}>
                    {count === 1 && <b className="h1" />}
                    {count !== undefined && count >= 2 && <b className="h2" />}
                  </i>
                );
              })}
            </div>
            {markers.map(m => (
              <span key={m.date} className="free-marker" style={{ left: daysBetween(rangeStart, m.date) * pxPerDay }}>{m.label}</span>
            ))}
          </div>
        </div>
      </div>
      {contextMenu && (
        <div
          role="menu"
          onMouseDown={event => event.stopPropagation()}
          style={{
            position: 'fixed', left: contextMenu.x, top: contextMenu.y, zIndex: 1000,
            minWidth: 150, padding: 4, border: '1px solid #cbd5e1', borderRadius: 6,
            background: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          }}
        >
          {onAddSchedule && (
            <>
              <button
                role="menuitem"
                type="button"
                onClick={() => {
                  onAddSchedule(contextMenu.id);
                  setContextMenu(null);
                }}
                style={{ display: 'block', width: '100%', padding: '6px 10px', textAlign: 'left', background: 'none' }}
              >
                予定を追加
              </button>
              <hr style={{ margin: '4px 0', borderColor: '#e2e8f0' }} />
            </>
          )}
          {statusOptions.map(status => (
            <button
              key={status}
              role="menuitem"
              type="button"
              onClick={() => {
                onStatusChange?.(contextMenu.id, status);
                setContextMenu(null);
              }}
              style={{
                display: 'block', width: '100%', padding: '6px 10px', textAlign: 'left', background: 'none',
              }}
            >
              {status === contextMenu.status ? `✓ ${status}` : status}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function BarRow({
  bar, rangeStart, pxPerDay, gridWidth, showBarLabel, todayLeftPx, schedules, onScheduleMove, nameColWidth, custColWidth,
  labelTotalWidth, onCommit, onProjectDoubleClick, onContextMenu,
}: {
  bar: DandoriBar;
  rangeStart: string;
  pxPerDay: number;
  gridWidth: number;
  showBarLabel: boolean;
  todayLeftPx: number | null;
  schedules: ProjectSchedule[];
  onScheduleMove?: (id: number, patch: { start_date?: string; end_date?: string }) => void;
  nameColWidth: number;
  custColWidth: number;
  labelTotalWidth: number;
  onCommit: (id: number, patch: { delivery_date?: string }) => void;
  onProjectDoubleClick: (id: number) => void;
  onContextMenu: (event: React.MouseEvent, status?: string) => void;
}) {
  const deadlineDrag = useDayDrag(pxPerDay, deltaDays => bar.delivery && onCommit(bar.id, { delivery_date: addDaysISO(bar.delivery, deltaDays) }));
  const deadlineLeftPx = bar.delivery ? daysBetween(rangeStart, bar.delivery) * pxPerDay + deadlineDrag.dragOffsetPx : null;

  return (
    <div className="row" onContextMenu={event => onContextMenu(event, bar.status)}>
      <div className="label-col" style={{ width: labelTotalWidth }}>
        <div className="name-col" style={{ width: nameColWidth, textAlign: 'left' }} onDoubleClick={() => onProjectDoubleClick(bar.id)}>
          <span className="name">{bar.name}</span>
        </div>
        <div className="cust-col" style={{ width: custColWidth, textAlign: 'left' }}>
          <span className="cust">{bar.customerName}</span>
        </div>
      </div>
      <div className="grid-col" style={{ width: gridWidth }}>
        <div className="grid-bg" style={gridBgStyle(pxPerDay)} />
        <TodayCol leftPx={todayLeftPx} pxPerDay={pxPerDay} />
        {bar.frame && (
          <div
            className="sched-frame"
            style={{
              left: daysBetween(rangeStart, bar.frame.start) * pxPerDay,
              width: (daysBetween(bar.frame.start, bar.frame.end) + 1) * pxPerDay,
            }}
          />
        )}
        {bar.segments.map(segment => (
          <ProductionBar
            key={segment.scheduleId}
            bar={bar}
            segment={segment}
            rangeStart={rangeStart}
            pxPerDay={pxPerDay}
            showBarLabel={showBarLabel}
            onMove={onScheduleMove}
            onProjectDoubleClick={onProjectDoubleClick}
          />
        ))}
        {schedules.filter(s => !isProductionSegment(s)).map(s => (
          <ScheduleMark
            key={s.id}
            schedule={s}
            rangeStart={rangeStart}
            pxPerDay={pxPerDay}
            onMove={onScheduleMove}
          />
        ))}
        {deadlineLeftPx !== null && (
          <div className="deadline" style={{ left: deadlineLeftPx }} {...deadlineDrag.handlers} />
        )}
      </div>
    </div>
  );
}

function isProductionSegment(s: ProjectSchedule): boolean {
  return s.kind === '製作' && !!s.start_date;
}

/** R-0222: 製作の予定1行ぶんのバー。ドラッグでその予定の開始日（終了があれば同じ日数だけ終了も）を動かす */
function ProductionBar({
  bar, segment, rangeStart, pxPerDay, showBarLabel, onMove, onProjectDoubleClick,
}: {
  bar: DandoriBar;
  segment: ProductionSegment;
  rangeStart: string;
  pxPerDay: number;
  showBarLabel: boolean;
  onMove?: (id: number, patch: { start_date?: string; end_date?: string }) => void;
  onProjectDoubleClick: (id: number) => void;
}) {
  const drag = useDayDrag(pxPerDay, deltaDays => onMove?.(
    segment.scheduleId,
    shiftScheduleDates({ start_date: segment.start, end_date: segment.fixedEnd }, deltaDays),
  ));
  const leftPx = daysBetween(rangeStart, segment.start) * pxPerDay + drag.dragOffsetPx;
  const widthPx = (daysBetween(segment.start, segment.end) + 1) * pxPerDay;
  const overDays = bar.delivery && segment.end > bar.delivery ? daysBetween(bar.delivery, segment.end) : 0;
  const labelText = `${bar.name}（${segment.hours === null ? '?' : formatHours(segment.hours)}h）`;
  const labelFitsInside = estimateLabelWidth(labelText) <= widthPx;

  return (
    <>
      <div
        className={barClassName(bar, segment)}
        style={{ left: leftPx, width: widthPx, ...(bar.salesBorderColor ? { ['--sales-border' as string]: bar.salesBorderColor } : {}) }}
        {...drag.handlers}
        onDoubleClick={e => { e.stopPropagation(); onProjectDoubleClick(bar.id); }}
      >
        {showBarLabel && labelFitsInside && labelText}
        {overDays > 0 && <div className="over" style={{ width: overDays * pxPerDay }} />}
      </div>
      {showBarLabel && !labelFitsInside && (
        <span className="bar-label-outside" style={{ left: leftPx + widthPx + 6 }}>{labelText}</span>
      )}
    </>
  );
}

function scheduleTitle(s: ProjectSchedule): string {
  const period = s.start_date && s.end_date
    ? `${formatMD(s.start_date)}〜${formatMD(s.end_date)}`
    : s.start_date ? `${formatMD(s.start_date)}から` : s.end_date ? `${formatMD(s.end_date)}まで` : '';
  return [scheduleKindName(s), period, s.hours ? `${formatHours(s.hours)}h` : '', s.memo].filter(Boolean).join(' ');
}

/** R-0220: 案件の予定。取付は太いバー、それ以外は行の上の細い帯、期限だけは◆で描く */
function ScheduleMark({
  schedule, rangeStart, pxPerDay, onMove,
}: {
  schedule: ProjectSchedule;
  rangeStart: string;
  pxPerDay: number;
  onMove?: (id: number, patch: { start_date?: string; end_date?: string }) => void;
}) {
  const drag = useDayDrag(pxPerDay, deltaDays => onMove?.(schedule.id, shiftScheduleDates(schedule, deltaDays)));
  const isInstall = schedule.kind === '取付';
  const startISO = schedule.start_date ?? schedule.end_date;
  const endISO = schedule.end_date ?? schedule.start_date;
  if (!startISO || !endISO) return null;
  const leftPx = daysBetween(rangeStart, startISO) * pxPerDay + drag.dragOffsetPx;
  const widthPx = (daysBetween(startISO, endISO) + 1) * pxPerDay;
  const doneClass = schedule.done ? ' done' : '';
  const label = scheduleLabel(schedule);

  if (!schedule.start_date && !isInstall) {
    return (
      <>
        <div
          className={`sched-diamond${doneClass}`}
          style={{ left: leftPx + pxPerDay / 2 - 5 }}
          title={scheduleTitle(schedule)}
          {...drag.handlers}
        />
        <span className="sched-label" style={{ left: leftPx + pxPerDay / 2 + 8 }}>{label}</span>
      </>
    );
  }

  return (
    <>
      <div
        className={`${isInstall ? 'sched-install' : 'sched-thin'}${doneClass}`}
        style={{ left: leftPx, width: widthPx }}
        title={scheduleTitle(schedule)}
        {...drag.handlers}
      >
        {isInstall && widthPx >= 40 && label}
      </div>
      {!isInstall && <span className="sched-label" style={{ left: leftPx + widthPx + 4 }}>{label}</span>}
    </>
  );
}
