import { addDaysISO, daysBetween, formatMD, type DandoriBar } from './dandoriBoardUtils';

const WEEKDAY_LABEL = ['日', '月', '火', '水', '木', '金', '土'];

function barClassName(bar: DandoriBar, contL: boolean, contR: boolean): string {
  const category = bar.category === 'done' ? 'done' : bar.category === 'notstarted' ? 'notstarted' : 'working';
  return [
    'wrap-bar', category, bar.isShop && bar.category !== 'done' ? 'shop' : '',
    contL ? 'cont-l' : '', contR ? 'cont-r' : '',
  ].filter(Boolean).join(' ');
}

interface WrapViewProps {
  bars: DandoriBar[];
  rangeStart: string;
  rangeEnd: string;
  todayISO: string;
  onProjectDoubleClick: (id: number) => void;
}

/** 週単位で時間軸を折り返す閲覧専用ビュー（v1はドラッグ不可） */
export default function WrapView({ bars, rangeStart, rangeEnd, todayISO, onProjectDoubleClick }: WrapViewProps) {
  const weeks: { start: string; end: string }[] = [];
  for (let cur = rangeStart; cur <= rangeEnd; cur = addDaysISO(cur, 7)) {
    weeks.push({ start: cur, end: addDaysISO(cur, 6) });
  }

  return (
    <div className="wrap-preview">
      {weeks.map(week => {
        const weekBars = bars
          .filter(b => b.start <= week.end && b.end >= week.start)
          .sort((a, b) => a.start.localeCompare(b.start));
        const todayInWeek = todayISO >= week.start && todayISO <= week.end;

        return (
          <div className="wrap-week" key={week.start}>
            <div className="w-grid" />
            <div className="w-head">{formatMD(week.start)}〜{formatMD(week.end)}の週</div>
            <div className="w-days">
              {Array.from({ length: 7 }, (_, i) => addDaysISO(week.start, i)).map(d => {
                const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
                return <i key={d} className={dow === 0 || dow === 6 ? 'we' : ''}>{WEEKDAY_LABEL[dow]} {Number(d.slice(8, 10))}</i>;
              })}
            </div>
            <div className="wrap-lanes">
              {todayInWeek && (
                <div className="w-today" style={{ left: `${(daysBetween(week.start, todayISO) / 7) * 100}%`, width: `${(1 / 7) * 100}%` }} />
              )}
              {weekBars.map(bar => {
                if (!bar.delivery || bar.delivery < week.start || bar.delivery > week.end) return null;
                return <div key={`dl-${bar.id}`} className="w-deadline" style={{ left: `${(daysBetween(week.start, bar.delivery) / 7) * 100}%` }} />;
              })}
              {weekBars.map(bar => {
                const segStart = bar.start < week.start ? week.start : bar.start;
                const segEnd = bar.end > week.end ? week.end : bar.end;
                const contL = bar.start < week.start;
                const contR = bar.end > week.end;
                const leftPct = (daysBetween(week.start, segStart) / 7) * 100;
                const widthPct = ((daysBetween(segStart, segEnd) + 1) / 7) * 100;
                return (
                  <div
                    key={bar.id}
                    className={barClassName(bar, contL, contR)}
                    style={{ marginLeft: `${leftPct}%`, width: `${widthPct}%` }}
                    onDoubleClick={() => onProjectDoubleClick(bar.id)}
                  >
                    {contL && '◀ '}{bar.name}（{bar.customerName}）
                    {contR && <span className="cont-mark">続く ▶</span>}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
