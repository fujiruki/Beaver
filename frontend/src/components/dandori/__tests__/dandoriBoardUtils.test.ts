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
  scheduledProjects,
  scheduleLabel,
  productionPlacement,
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

describe('buildBar（R-0222: 製作の予定からバーを描く）', () => {
  const prod = (over: object = {}) => ({
    id: 1, project_id: 1, kind: '製作', start_date: '2024-01-01', end_date: null, hours: null,
    memo: '', done: 0, created_at: '', updated_at: '', ...over,
  });

  it('得意先名に「社内」を含む案件はisShop=true。終了が空なら案件の工数から終わりを出す', () => {
    const bar = buildBar({ id: 1, name: 'x', customer_name: '社内・展示会', status: '進行中', delivery_date: null, effective_estimated_hours: 16 }, [prod()] as never, 8);
    expect(bar.isShop).toBe(true);
    expect(bar.category).toBe('working');
    expect(bar.end).toBe('2024-01-02');
    expect(bar.segments).toHaveLength(1);
    expect(bar.segments[0].unknownHours).toBe(false);
  });

  it('工数もnullなら unknownHours=true・幅1日', () => {
    const bar = buildBar({ id: 2, name: 'y', status: '問い合わせ', delivery_date: null, effective_estimated_hours: null }, [prod()] as never, 8);
    expect(bar.segments[0].unknownHours).toBe(true);
    expect(bar.end).toBe('2024-01-01');
    expect(bar.category).toBe('notstarted');
  });

  it('予定のhoursがあれば案件の工数より優先して終わりを出す', () => {
    const bar = buildBar({ id: 1, name: 'x', status: '進行中', delivery_date: null, effective_estimated_hours: 16 }, [prod({ hours: 24 })] as never, 8);
    expect(bar.segments[0].end).toBe('2024-01-03');
    expect(bar.segments[0].hours).toBe(24);
  });

  it('終了があればそれが終わり（時間は長さを決めない）', () => {
    const bar = buildBar({ id: 1, name: 'x', status: '進行中', delivery_date: null, effective_estimated_hours: 16 }, [prod({ end_date: '2024-01-10', hours: 2 })] as never, 8);
    expect(bar.segments[0].end).toBe('2024-01-10');
  });

  it('製作が2行あれば2本のバーになる。開始日の無い製作はバーにしない', () => {
    const bar = buildBar({ id: 1, name: 'x', status: '進行中', delivery_date: null, effective_estimated_hours: 8 },
      [prod({ id: 1 }), prod({ id: 2, start_date: '2024-01-10' }), prod({ id: 3, start_date: null, hours: 4 })] as never, 8);
    expect(bar.segments.map(g => [g.scheduleId, g.start, g.end])).toEqual([[1, '2024-01-01', '2024-01-01'], [2, '2024-01-10', '2024-01-10']]);
  });

  it('全体の枠は予定の一番早い日から一番遅い日まで（済・取付も含む）', () => {
    const sch = [
      prod({ start_date: '2024-01-03' }),
      prod({ id: 2, kind: '見積', start_date: null, end_date: '2024-01-01', done: 1 }),
      prod({ id: 3, kind: '取付', start_date: '2024-01-08', end_date: '2024-01-09' }),
    ];
    const bar = buildBar({ id: 1, name: 'x', status: '進行中', delivery_date: null, effective_estimated_hours: 24 }, sch as never, 8);
    expect(bar.frame).toEqual({ start: '2024-01-01', end: '2024-01-09' });
  });

  it('日付のある予定が1つだけなら、その予定の範囲が枠になる。製作のバーは無い', () => {
    const bar = buildBar({ id: 1, name: 'x', status: '進行中', delivery_date: null }, [prod({ kind: '見積', start_date: null, end_date: '2024-01-05' })] as never, 8);
    expect(bar.frame).toEqual({ start: '2024-01-05', end: '2024-01-05' });
    expect(bar.segments).toEqual([]);
  });

  it('枠の終わりは製作の自動の終わりが他の予定より遅ければそちら', () => {
    const sch = [prod({ start_date: '2024-01-01', hours: 24 }), prod({ id: 2, kind: '現調', start_date: null, end_date: '2024-01-02' })];
    const bar = buildBar({ id: 1, name: 'x', status: '進行中', delivery_date: null }, sch as never, 8);
    expect(bar.frame).toEqual({ start: '2024-01-01', end: '2024-01-03' });
  });
});

describe('unstartedProjects', () => {
  const projects = [
    { id: 1, status: '問い合わせ' },
    { id: 2, status: '進行中' },
    { id: 3, status: '完了' },
  ];

  it('既定では完了・キャンセル系を除外する', () => {
    expect(unstartedProjects(projects, false, new Set([2])).map(p => p.id)).toEqual([1]);
  });

  it('showDone=trueなら完了・キャンセル系も含める', () => {
    expect(unstartedProjects(projects, true, new Set([2])).map(p => p.id)).toEqual([1, 3]);
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

describe('nextExtraDays（R-0146/R-0223: シームレススクロールの延長日数計算）', () => {
  it('指定ステップぶん増える', () => {
    expect(nextExtraDays(0, 28)).toBe(28);
    expect(nextExtraDays(28, 28)).toBe(56);
  });

  it('2年（730日）を超えても止まらず、ステップぶん増え続ける', () => {
    expect(nextExtraDays(720, 28)).toBe(748);
    expect(nextExtraDays(730, 28)).toBe(758);
    expect(nextExtraDays(1000, 28)).toBe(1028);
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

describe('loadIntervals（R-0220/R-0222: 稼働数には製作と取付だけを数える）', () => {
  const seg = (over: object = {}) => ({ scheduleId: 1, start: '2024-01-01', end: '2024-01-02', hours: null, fixedEnd: null, done: false, unknownHours: false, ...over });
  const bars = [{ id: 1, segments: [seg()] }];
  const sch = (over: object) => ({
    id: 1, project_id: 1, kind: '取付', start_date: null, end_date: '2024-01-03', hours: null,
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

  it('開始だけの取付はその1日', () => {
    const r = loadIntervals([], [sch({ project_id: 2, start_date: '2024-01-04', end_date: null })] as never);
    expect(r).toEqual([{ id: 2, start: '2024-01-04', end: '2024-01-04' }]);
  });

  it('日付の無い取付は数えない', () => {
    expect(loadIntervals([], [sch({ start_date: null, end_date: null, hours: 4 })] as never)).toEqual([]);
  });

  it('済の取付は数えない', () => {
    expect(loadIntervals(bars, [sch({ done: 1 })] as never)).toHaveLength(1);
  });

  it('済の製作のバーは数えない', () => {
    expect(loadIntervals([{ id: 1, segments: [seg({ done: true })] }], [])).toEqual([]);
  });

  it('1つの案件に製作が2本あればそれぞれ区間になる', () => {
    const r = loadIntervals([{ id: 1, segments: [seg(), seg({ scheduleId: 2, start: '2024-01-10', end: '2024-01-11' })] }], []);
    expect(r).toHaveLength(2);
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

describe('scheduledProjects（R-0222: 日付のある予定が1つ以上ある案件に行を出す）', () => {
  const projects = [
    { id: 1, status: '問い合わせ' },
    { id: 2, status: '問い合わせ' },
    { id: 3, status: '完了' },
  ];
  const s = (project_id: number, over: object = {}) => ({ project_id, start_date: null, end_date: '2024-01-03', hours: null, done: 0, ...over });

  it('日付のある予定がある案件だけ返す。済の予定も日付があれば行に出す', () => {
    const r = scheduledProjects(projects, [s(1), s(2, { done: 1 }), s(2, { end_date: null, hours: 3 })] as never, false);
    expect(r.map(p => p.id)).toEqual([1, 2]);
  });

  it('時間だけの予定しかない案件は出さない', () => {
    expect(scheduledProjects(projects, [s(1, { end_date: null, hours: 3 })] as never, false)).toEqual([]);
  });

  it('完了系の案件は隠し、showDoneなら出す', () => {
    expect(scheduledProjects(projects, [s(3)] as never, false)).toEqual([]);
    expect(scheduledProjects(projects, [s(3)] as never, true).map(p => p.id)).toEqual([3]);
  });
});

describe('productionPlacement（R-0222: 未着手の「置く」は製作の予定を作る）', () => {
  const s = (over: object) => ({ id: 1, project_id: 1, kind: '製作', start_date: null, end_date: null, hours: 4, ...over });

  it('製作の予定が無ければ、開始日つきの製作を作る', () => {
    expect(productionPlacement([], 1, '2024-01-05')).toEqual({ type: 'create', input: { kind: '製作', start_date: '2024-01-05' } });
    expect(productionPlacement([s({ kind: '見積', end_date: '2024-01-01' })] as never, 1, '2024-01-05').type).toBe('create');
  });

  it('開始日の無い製作の予定があれば、それに開始日を入れる', () => {
    expect(productionPlacement([s({ id: 7 }), s({ id: 8, project_id: 2 })] as never, 1, '2024-01-05'))
      .toEqual({ type: 'update', id: 7, patch: { start_date: '2024-01-05' } });
  });

  it('開始日のある製作しか無ければ新しく作る', () => {
    expect(productionPlacement([s({ start_date: '2024-01-02' })] as never, 1, '2024-01-05').type).toBe('create');
  });
});

describe('scheduleLabel', () => {
  it('種類名の横に時間を出す。時間が無ければ種類名だけ', () => {
    expect(scheduleLabel({ kind: '見積', hours: 2 })).toBe('見積 2h');
    expect(scheduleLabel({ kind: '見積', hours: 1.25 })).toBe('見積 1.3h');
    expect(scheduleLabel({ kind: '見積', hours: null })).toBe('見積');
  });

  it('「その他」で工程名があれば工程名を出す。ほかの種類や空の工程名は種類名', () => {
    expect(scheduleLabel({ kind: 'その他', hours: 2, name: '塗装' })).toBe('塗装 2h');
    expect(scheduleLabel({ kind: 'その他', hours: null, name: '塗装' })).toBe('塗装');
    expect(scheduleLabel({ kind: 'その他', hours: null, name: '' })).toBe('その他');
    expect(scheduleLabel({ kind: '見積', hours: null, name: '塗装' })).toBe('見積');
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

  it('日付の無い予定は一番下にまとめる。終了が無ければ開始で並べる', () => {
    const r = todoSchedules([
      { id: 1, start_date: null, end_date: null, done: 0 },
      { id: 2, start_date: '2024-01-04', end_date: null, done: 0 },
      sch(3, '2024-01-03'),
    ] as never, false);
    expect(r.map(s => s.id)).toEqual([3, 2, 1]);
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

  it('開始だけの予定は開始だけ動かす（製作のバー）', () => {
    expect(shiftScheduleDates({ start_date: '2024-01-03', end_date: null }, 3))
      .toEqual({ start_date: '2024-01-06' });
  });
});

describe('isScheduleOverdue', () => {
  it('期限が今日より前で済でないものだけ true', () => {
    expect(isScheduleOverdue({ end_date: '2024-01-01', done: 0 }, '2024-01-02')).toBe(true);
    expect(isScheduleOverdue({ end_date: '2024-01-02', done: 0 }, '2024-01-02')).toBe(false);
    expect(isScheduleOverdue({ end_date: '2024-01-01', done: 1 }, '2024-01-02')).toBe(false);
    expect(isScheduleOverdue({ end_date: null, done: 0 }, '2024-01-02')).toBe(false);
  });
});
