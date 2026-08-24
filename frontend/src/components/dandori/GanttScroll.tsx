import { useRef, useState } from 'react';
import { dailyLoad } from '../../lib/dandoriCalc';
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

const LABEL_WIDTH = 240;
const DETAIL_THRESHOLD_PX = 12; // これ未満は日付数字を消して月境界表示にする
const LABEL_THRESHOLD_PX = 10;  // これ未満はバー内ラベルを消す

function gridBgStyle(pxPerDay: number): React.CSSProperties {
  const cycle = 7 * pxPerDay;
  const weekendStart = 5 * pxPerDay;
  const images = [`repeating-linear-gradient(to right, transparent 0 ${weekendStart}px, rgba(138,129,119,0.10) ${weekendStart}px ${cycle}px)`];
  if (pxPerDay >= DETAIL_THRESHOLD_PX) {
    images.push(`repeating-linear-gradient(to right, var(--line) 0 1px, transparent 1px ${pxPerDay}px)`);
  }
  return { backgroundImage: images.join(', ') };
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
}

export default function GanttScroll({ bars, rangeStart, rangeEnd, pxPerDay, todayISO, onCommit }: GanttScrollProps) {
  const totalDays = daysBetween(rangeStart, rangeEnd) + 1;
  const gridWidth = totalDays * pxPerDay;
  const showDayNumbers = pxPerDay >= DETAIL_THRESHOLD_PX;
  const showBarLabel = pxPerDay >= LABEL_THRESHOLD_PX;
  const todayInRange = todayISO >= rangeStart && todayISO <= rangeEnd;
  const todayLeftPx = todayInRange ? daysBetween(rangeStart, todayISO) * pxPerDay : null;

  const sortedBars = [...bars].sort((a, b) => a.start.localeCompare(b.start));
  const load = dailyLoad(sortedBars.map(b => ({ start: b.start, end: b.end })), rangeStart, rangeEnd);
  const markers = freeMarkerLabels(load, todayISO);
  const loadDays = enumerateDays(rangeStart, rangeEnd);

  return (
    <div className="gantt-scroll">
      <div className="gantt" style={{ width: LABEL_WIDTH + gridWidth }}>
        <div className="axis">
          <div className="label-col">案件</div>
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
            onCommit={onCommit}
          />
        ))}

        <div className="load-row">
          <div className="label-col">1日の稼働案件数</div>
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

function BarRow({ bar, rangeStart, pxPerDay, gridWidth, showBarLabel, todayLeftPx, onCommit }: {
  bar: DandoriBar;
  rangeStart: string;
  pxPerDay: number;
  gridWidth: number;
  showBarLabel: boolean;
  todayLeftPx: number | null;
  onCommit: (id: number, patch: { start_date?: string; delivery_date?: string }) => void;
}) {
  const barDrag = useDayDrag(pxPerDay, deltaDays => onCommit(bar.id, { start_date: addDaysISO(bar.start, deltaDays) }));
  const deadlineDrag = useDayDrag(pxPerDay, deltaDays => bar.delivery && onCommit(bar.id, { delivery_date: addDaysISO(bar.delivery, deltaDays) }));

  const leftPx = daysBetween(rangeStart, bar.start) * pxPerDay + barDrag.dragOffsetPx;
  const widthPx = (daysBetween(bar.start, bar.end) + 1) * pxPerDay;
  const overDays = bar.delivery && bar.end > bar.delivery ? daysBetween(bar.delivery, bar.end) : 0;
  const deadlineLeftPx = bar.delivery ? daysBetween(rangeStart, bar.delivery) * pxPerDay + deadlineDrag.dragOffsetPx : null;

  return (
    <div className="row">
      <div className="label-col">
        <span className="name">{bar.name}</span>
        <span className="cust">{bar.customerName}</span>
      </div>
      <div className="grid-col" style={{ width: gridWidth }}>
        <div className="grid-bg" style={gridBgStyle(pxPerDay)} />
        <TodayCol leftPx={todayLeftPx} pxPerDay={pxPerDay} />
        <div
          className={barClassName(bar)}
          style={{ left: leftPx, width: widthPx }}
          {...barDrag.handlers}
        >
          {showBarLabel && `${bar.name}（${bar.hours ?? '?'}h）`}
          {overDays > 0 && <div className="over" style={{ width: overDays * pxPerDay }} />}
        </div>
        {deadlineLeftPx !== null && (
          <div className="deadline" style={{ left: deadlineLeftPx }} {...deadlineDrag.handlers} />
        )}
      </div>
    </div>
  );
}
