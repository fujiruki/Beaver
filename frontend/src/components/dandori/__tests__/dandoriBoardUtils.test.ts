import { describe, it, expect } from 'vitest';
import { dailyLoad } from '../../../lib/dandoriCalc';
import {
  statusCategory,
  daysBetween,
  addDaysISO,
  mondayOfWeek,
  formatMD,
  rangeForPreset,
  freeMarkerLabels,
  monthBoundaries,
  buildBar,
  unstartedProjects,
  nextFreeDay,
  nextExtraDays,
  loadIntervals,
  scheduleOnlyProjects,
  todoSchedules,
  shiftScheduleDates,
  isScheduleOverdue,
} from '../dandoriBoardUtils';

describe('statusCategory', () => {
  it('未着手系ステータスはnotstarted', () => {
    expect(statusCategory('問い合わせ')).toBe('notstarted');
    expect(statusCategory('見積済')).toBe('notstarted');
    expect(statusCategory('受注済')).toBe('notstarted');
  });

  it('着手中系ステータスはworking', () => {
    expect(statusCategory('進行中')).toBe('working');
    expect(statusCategory('納品済')).toBe('working');
    expect(statusCategory('請求済')).toBe('working');
  });

  it('完了・キャンセルはdone', () => {
    expect(statusCategory('完了')).toBe('done');
    expect(statusCategory('キャンセル')).toBe('done');
  });
});

describe('daysBetween / addDaysISO', () => {
  it('日数差を計算できる', () => {
    expect(daysBetween('2024-01-01', '2024-01-08')).toBe(7);
  });

  it('日付を加算できる（負数も可）', () => {
    expect(addDaysISO('2024-01-08', -7)).toBe('2024-01-01');
  });
});

describe('mondayOfWeek', () => {
  it('月曜日はそのまま', () => {
    expect(mondayOfWeek('2024-01-01')).toBe('2024-01-01');
  });

  it('日曜日は前の月曜日', () => {
    expect(mondayOfWeek('2024-01-07')).toBe('2024-01-01');
  });

  it('週の途中の曜日はその週の月曜日', () => {
    expect(mondayOfWeek('2024-01-05')).toBe('2024-01-01'); // 金曜
  });
});

describe('formatMD', () => {
  it('M/D形式に変換する', () => {
    expect(formatMD('2024-01-05')).toBe('1/5');
  });
});

describe('rangeForPreset', () => {
  it('8週間: 今日を含む週の月曜の2週間前〜56日後', () => {
    const { start, end } = rangeForPreset('2024-01-10', '8w'); // 水曜
    expect(start).toBe('2023-12-25'); // 1/8(月)の2週間前
    expect(end).toBe('2024-02-18'); // start + 55日
  });

  it('6ヶ月と1年はより長い範囲になる', () => {
    const r8w = rangeForPreset('2024-01-10', '8w');
    const r6m = rangeForPreset('2024-01-10', '6m');
    const r1y = rangeForPreset('2024-01-10', '1y');
    expect(r6m.start).toBe(r8w.start);
    expect(daysBetween(r6m.start, r6m.end)).toBeGreaterThan(daysBetween(r8w.start, r8w.end));
    expect(daysBetween(r1y.start, r1y.end)).toBeGreaterThan(daysBetween(r6m.start, r6m.end));
  });
});

describe('monthBoundaries', () => {
  it('左端は必ず月ラベル、以降は月初めごとに境界線', () => {
    expect(monthBoundaries('2024-01-15', '2024-03-10')).toEqual([
      { date: '2024-01-15', label: '1月', isEdge: true },
      { date: '2024-02-01', label: '2月', isEdge: false },
      { date: '2024-03-01', label: '3月', isEdge: false },
    ]);
  });
});

describe('buildBar', () => {
  it('得意先名に「社内」を含む案件はisShop=true', () => {
    const bar = buildBar({ id: 1, name: 'x', customer_name: '社内・展示会', status: '進行中', start_date: '2024-01-01', delivery_date: null, effective_estimated_hours: 16 }, 8);
    expect(bar.isShop).toBe(true);
    expect(bar.category).toBe('working');
    expect(bar.end).toBe('2024-01-02');
    expect(bar.unknownHours).toBe(false);
  });

  it('工数がnullなら unknownHours=true・幅1日', () => {
    const bar = buildBar({ id: 2, name: 'y', status: '問い合わせ', start_date: '2024-01-01', delivery_date: null, effective_estimated_hours: null }, 8);
    expect(bar.unknownHours).toBe(true);
    expect(bar.end).toBe('2024-01-01');
    expect(bar.category).toBe('notstarted');
  });
});

describe('unstartedProjects', () => {
  const projects = [
    { id: 1, status: '問い合わせ', start_date: null },
    { id: 2, status: '進行中', start_date: '2024-01-01' },
    { id: 3, status: '完了', start_date: null },
  ];

  it('既定では完了・キャンセル系を除外する', () => {
    expect(unstartedProjects(projects, false).map(p => p.id)).toEqual([1]);
  });

  it('showDone=trueなら完了・キャンセル系も含める', () => {
    expect(unstartedProjects(projects, true).map(p => p.id)).toEqual([1, 3]);
  });
});

describe('nextFreeDay', () => {
  it('連続したバーの直後（土日を挟む）翌営業日を返す', () => {
    const bars = [{ start: '2024-01-01', end: '2024-01-05' }]; // 月〜金
    expect(nextFreeDay(bars, '2024-01-01')).toBe('2024-01-08'); // 翌月曜
  });

  it('バーの途中に空きがあればその穴を返す', () => {
    const bars = [
      { start: '2024-01-01', end: '2024-01-02' },
      { start: '2024-01-04', end: '2024-01-05' },
    ];
    expect(nextFreeDay(bars, '2024-01-01')).toBe('2024-01-03'); // 水曜が空き
  });

  it('バーが無ければ今日（平日）を返す', () => {
    expect(nextFreeDay([], '2024-01-01')).toBe('2024-01-01'); // 月曜
  });

  it('バーが無く今日が土日なら次の月曜を返す', () => {
    expect(nextFreeDay([], '2024-01-06')).toBe('2024-01-08'); // 土曜起点→翌月曜
  });
});

describe('nextExtraDays（R-0146: シームレススクロールの延長日数計算）', () => {
  it('上限未満なら指定ステップぶん増える', () => {
    expect(nextExtraDays(0, 28, 730)).toBe(28);
    expect(nextExtraDays(28, 28, 730)).toBe(56);
  });

  it('ステップを加えると上限を超える場合は上限で頭打ちになる', () => {
    expect(nextExtraDays(720, 28, 730)).toBe(730);
  });

  it('既に上限に達している場合はそれ以上増えない', () => {
    expect(nextExtraDays(730, 28, 730)).toBe(730);
  });
});

describe('freeMarkerLabels', () => {
  it('1日だけの空きは「空き」、連続する空きは「から空き」になる', () => {
    // 木(0),金(1),月(0),火(0)
    const load = dailyLoad(
      [{ start: '2024-01-05', end: '2024-01-05' }],
      '2024-01-04',
      '2024-01-09',
    );
    expect(freeMarkerLabels(load, '2024-01-04')).toEqual([
      { date: '2024-01-04', label: '1/4 空き' },
      { date: '2024-01-08', label: '1/8 から空き' },
    ]);
  });
});

describe('loadIntervals（R-0220: 稼働数には製作と取付だけを数える）', () => {
  const bars = [{ id: 1, start: '2024-01-01', end: '2024-01-02' }];
  const sch = (over: object) => ({
    id: 1, project_id: 1, kind: '取付', start_date: null, end_date: '2024-01-03',
    memo: '', done: 0, created_at: '', updated_at: '', ...over,
  });

  it('見積などは数えない', () => {
    const r = loadIntervals(bars, [sch({ kind: '見積' }), sch({ kind: '材料発注' })] as never);
    expect(r).toHaveLength(1);
  });

  it('済でない取付を足す。期限だけの取付はその1日', () => {
    const r = loadIntervals(bars, [sch({ project_id: 2 })] as never);
    expect(r).toContainEqual({ id: 2, start: '2024-01-03', end: '2024-01-03' });
  });

  it('済の取付は数えない', () => {
    expect(loadIntervals(bars, [sch({ done: 1 })] as never)).toHaveLength(1);
  });

  it('同じ案件の製作と取付が重なる日は1件と数える', () => {
    const intervals = loadIntervals(bars, [sch({ project_id: 1, start_date: '2024-01-02', end_date: '2024-01-04' })] as never);
    const load = dailyLoad(intervals, '2024-01-01', '2024-01-04');
    expect(load.get('2024-01-01')).toBe(1);
    expect(load.get('2024-01-02')).toBe(1);
    expect(load.get('2024-01-03')).toBe(1);
  });

  it('製作のバーが無い案件の取付も数える', () => {
    const intervals = loadIntervals([], [sch({ project_id: 9 })] as never);
    expect(dailyLoad(intervals, '2024-01-03', '2024-01-03').get('2024-01-03')).toBe(1);
  });
});

describe('scheduleOnlyProjects（R-0220: 開始日が無くても済でない予定があれば行を出す）', () => {
  const projects = [
    { id: 1, status: '問い合わせ', start_date: null },
    { id: 2, status: '問い合わせ', start_date: null },
    { id: 3, status: '完了', start_date: null },
    { id: 4, status: '進行中', start_date: '2024-01-01' },
  ];
  const s = (project_id: number, done = 0) => ({ project_id, done });

  it('開始日が無く済でない予定がある案件だけ返す', () => {
    const r = scheduleOnlyProjects(projects, [s(1), s(2, 1), s(4)] as never, false);
    expect(r.map(p => p.id)).toEqual([1]);
  });

  it('完了系の案件は隠し、showDoneなら出す', () => {
    expect(scheduleOnlyProjects(projects, [s(3)] as never, false)).toEqual([]);
    expect(scheduleOnlyProjects(projects, [s(3)] as never, true).map(p => p.id)).toEqual([3]);
  });
});

describe('unstartedProjects（R-0220: 行に出た案件は数えない）', () => {
  it('excludeIdsに入る案件を除く', () => {
    const projects = [
      { id: 1, status: '問い合わせ', start_date: null },
      { id: 2, status: '問い合わせ', start_date: null },
    ];
    expect(unstartedProjects(projects, false, new Set([1])).map(p => p.id)).toEqual([2]);
  });
});

describe('todoSchedules（R-0220: やること一覧）', () => {
  const sch = (id: number, end_date: string, done = 0) => ({ id, end_date, done });

  it('済でない予定を終了/期限の日付順に並べる', () => {
    const r = todoSchedules([sch(1, '2024-01-09'), sch(2, '2024-01-03'), sch(3, '2024-01-05', 1)] as never, false);
    expect(r.map(s => s.id)).toEqual([2, 1]);
  });

  it('済も表示なら済も並べる', () => {
    const r = todoSchedules([sch(1, '2024-01-09'), sch(3, '2024-01-05', 1)] as never, true);
    expect(r.map(s => s.id)).toEqual([3, 1]);
  });
});

describe('shiftScheduleDates（R-0220: ドラッグで日付を動かす）', () => {
  it('期間は開始と終了を同じ日数だけ動かす', () => {
    expect(shiftScheduleDates({ start_date: '2024-01-01', end_date: '2024-01-03' }, 2))
      .toEqual({ start_date: '2024-01-03', end_date: '2024-01-05' });
  });

  it('期限だけの予定は終了だけ動かす', () => {
    expect(shiftScheduleDates({ start_date: null, end_date: '2024-01-03' }, -1))
      .toEqual({ end_date: '2024-01-02' });
  });
});

describe('isScheduleOverdue', () => {
  it('期限が今日より前で済でないものだけ true', () => {
    expect(isScheduleOverdue({ end_date: '2024-01-01', done: 0 }, '2024-01-02')).toBe(true);
    expect(isScheduleOverdue({ end_date: '2024-01-02', done: 0 }, '2024-01-02')).toBe(false);
    expect(isScheduleOverdue({ end_date: '2024-01-01', done: 1 }, '2024-01-02')).toBe(false);
  });
});
