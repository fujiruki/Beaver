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
