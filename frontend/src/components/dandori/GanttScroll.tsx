import { useCallback, useRef, useState } from 'react';
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
  type DandoriBar,
} from './dandoriBoardUtils';

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

function barClassName(bar: DandoriBar): string {
  const category = bar.category === 'done' ? 'done' : bar.category === 'notstarted' ? 'notstarted' : 'working';
  return ['bar', category, bar.isShop && bar.category !== 'done' ? 'shop' : '', bar.unknownHours ? 'unknown-hours' : ''].filter(Boolean).join(' ');
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

interface GanttScrollProps {
  bars: DandoriBar[];
  rangeStart: string;
  rangeEnd: string;
  pxPerDay: number;
  todayISO: string;
  onCommit: (id: number, patch: { start_date?: string; delivery_date?: string }) => void;
  onProjectDoubleClick: (id: number) => void;
}

export default function GanttScroll({ bars, rangeStart, rangeEnd, pxPerDay, todayISO, onCommit, onProjectDoubleClick }: GanttScrollProps) {
  const totalDays = daysBetween(rangeStart, rangeEnd) + 1;
  const gridWidth = totalDays * pxPerDay;
  const showDayNumbers = pxPerDay >= DETAIL_THRESHOLD_PX;
  const showBarLabel = pxPerDay >= LABEL_THRESHOLD_PX;
  const todayInRange = todayISO >= rangeStart && todayISO <= rangeEnd;
  const todayLeftPx = todayInRange ? daysBetween(rangeStart, todayISO) * pxPerDay : null;
  const { nameColWidth, custColWidth, labelTotalWidth, onNameHandleDown, onTotalHandleDown } = useLabelWidths();

  const sortedBars = [...bars].sort((a, b) => a.start.localeCompare(b.start));
  const load = dailyLoad(sortedBars.map(b => ({ start: b.start, end: b.end })), rangeStart, rangeEnd);
  const markers = freeMarkerLabels(load, todayISO);
  const loadDays = enumerateDays(rangeStart, rangeEnd);

  return (
    <div className="gantt-scroll">
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
            nameColWidth={nameColWidth}
            custColWidth={custColWidth}
            labelTotalWidth={labelTotalWidth}
            onCommit={onCommit}
            onProjectDoubleClick={onProjectDoubleClick}
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
    </div>
  );
}

function BarRow({ bar, rangeStart, pxPerDay, gridWidth, showBarLabel, todayLeftPx, nameColWidth, custColWidth, labelTotalWidth, onCommit, onProjectDoubleClick }: {
  bar: DandoriBar;
  rangeStart: string;
  pxPerDay: number;
  gridWidth: number;
  showBarLabel: boolean;
  todayLeftPx: number | null;
  nameColWidth: number;
  custColWidth: number;
  labelTotalWidth: number;
  onCommit: (id: number, patch: { start_date?: string; delivery_date?: string }) => void;
  onProjectDoubleClick: (id: number) => void;
}) {
  const barDrag = useDayDrag(pxPerDay, deltaDays => onCommit(bar.id, { start_date: addDaysISO(bar.start, deltaDays) }));
  const deadlineDrag = useDayDrag(pxPerDay, deltaDays => bar.delivery && onCommit(bar.id, { delivery_date: addDaysISO(bar.delivery, deltaDays) }));

  const leftPx = daysBetween(rangeStart, bar.start) * pxPerDay + barDrag.dragOffsetPx;
  const widthPx = (daysBetween(bar.start, bar.end) + 1) * pxPerDay;
  const overDays = bar.delivery && bar.end > bar.delivery ? daysBetween(bar.delivery, bar.end) : 0;
  const deadlineLeftPx = bar.delivery ? daysBetween(rangeStart, bar.delivery) * pxPerDay + deadlineDrag.dragOffsetPx : null;

  const labelText = `${bar.name}（${bar.hours ?? '?'}h）`;
  const labelFitsInside = estimateLabelWidth(labelText) <= widthPx;

  return (
    <div className="row">
      <div className="label-col" style={{ width: labelTotalWidth }}>
        <div className="name-col" style={{ width: nameColWidth, textAlign: 'left' }}>
          <span className="name">{bar.name}</span>
        </div>
        <div className="cust-col" style={{ width: custColWidth, textAlign: 'left' }}>
          <span className="cust">{bar.customerName}</span>
        </div>
      </div>
      <div className="grid-col" style={{ width: gridWidth }}>
        <div className="grid-bg" style={gridBgStyle(pxPerDay)} />
        <TodayCol leftPx={todayLeftPx} pxPerDay={pxPerDay} />
        <div
          className={barClassName(bar)}
          style={{ left: leftPx, width: widthPx }}
          {...barDrag.handlers}
          onDoubleClick={e => { e.stopPropagation(); onProjectDoubleClick(bar.id); }}
        >
          {showBarLabel && labelFitsInside && labelText}
          {overDays > 0 && <div className="over" style={{ width: overDays * pxPerDay }} />}
        </div>
        {showBarLabel && !labelFitsInside && (
          <span className="bar-label-outside" style={{ left: leftPx + widthPx + 6 }}>{labelText}</span>
        )}
        {deadlineLeftPx !== null && (
          <div className="deadline" style={{ left: deadlineLeftPx }} {...deadlineDrag.handlers} />
        )}
      </div>
    </div>
  );
}
