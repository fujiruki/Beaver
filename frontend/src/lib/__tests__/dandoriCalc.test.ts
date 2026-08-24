import { describe, it, expect } from 'vitest';
import { workdaysFromHours, barEndDate, dailyLoad, freeDayMarkers } from '../dandoriCalc';

// 2024-01-01は月曜日（以降の曜日は暦通り: 01=月,02=火,03=水,04=木,05=金,06=土,07=日,08=月,09=火）

describe('workdaysFromHours', () => {
  it('8h/日で20h → ceil(2.5)=3日', () => {
    expect(workdaysFromHours(20, 8)).toBe(3);
  });

  it('ちょうど割り切れる場合はその日数', () => {
    expect(workdaysFromHours(16, 8)).toBe(2);
  });

  it('1日分を僅かに超える場合は切り上げで+1日', () => {
    expect(workdaysFromHours(8.1, 8)).toBe(2);
  });

  it('hoursがnull → 最低1日', () => {
    expect(workdaysFromHours(null, 8)).toBe(1);
  });

  it('hoursが0 → 最低1日', () => {
    expect(workdaysFromHours(0, 8)).toBe(1);
  });

  it('hoursPerDayが0 → 防御的に1日', () => {
    expect(workdaysFromHours(100, 0)).toBe(1);
  });

  it('hoursPerDayが負値 → 防御的に1日', () => {
    expect(workdaysFromHours(100, -8)).toBe(1);
  });
});

describe('barEndDate', () => {
  it('月曜開始・1日 → 同日終了', () => {
    expect(barEndDate('2024-01-01', 1)).toBe('2024-01-01');
  });

  it('月曜開始・5日 → 週内で金曜終了（土日をまたがない）', () => {
    expect(barEndDate('2024-01-01', 5)).toBe('2024-01-05');
  });

  it('月曜開始・6日 → 土日をまたいで翌週月曜終了', () => {
    expect(barEndDate('2024-01-01', 6)).toBe('2024-01-08');
  });

  it('金曜開始・3日 → 金(1)月(2)火(3)で翌週火曜終了', () => {
    expect(barEndDate('2024-01-05', 3)).toBe('2024-01-09');
  });

  it('土曜開始・1日 → 次の月曜から消化して月曜終了', () => {
    expect(barEndDate('2024-01-06', 1)).toBe('2024-01-08');
  });

  it('日曜開始・2日 → 次の月曜が1日目、火曜が2日目', () => {
    expect(barEndDate('2024-01-07', 2)).toBe('2024-01-09');
  });
});

describe('dailyLoad', () => {
  it('範囲内の平日ごとにバー件数を数え、土日は含まない', () => {
    const bars = [
      { start: '2024-01-01', end: '2024-01-03' },
      { start: '2024-01-03', end: '2024-01-05' },
    ];
    const load = dailyLoad(bars, '2024-01-01', '2024-01-08');

    // 土日(01-06, 01-07)はキーとして存在しない
    expect(load.has('2024-01-06')).toBe(false);
    expect(load.has('2024-01-07')).toBe(false);

    expect(load.get('2024-01-01')).toBe(1);
    expect(load.get('2024-01-02')).toBe(1);
    expect(load.get('2024-01-03')).toBe(2); // 2本のバーが重なる境界日
    expect(load.get('2024-01-04')).toBe(1);
    expect(load.get('2024-01-05')).toBe(1);
    expect(load.get('2024-01-08')).toBe(0);
  });

  it('該当バーがない平日は0件として登録される', () => {
    const load = dailyLoad([], '2024-01-01', '2024-01-02');
    expect(load.get('2024-01-01')).toBe(0);
    expect(load.get('2024-01-02')).toBe(0);
    expect(load.size).toBe(2);
  });

  it('rangeStart=rangeEndが平日なら1件のみ登録', () => {
    const load = dailyLoad([{ start: '2024-01-01', end: '2024-01-01' }], '2024-01-01', '2024-01-01');
    expect(load.size).toBe(1);
    expect(load.get('2024-01-01')).toBe(1);
  });
});

describe('freeDayMarkers', () => {
  it('土日をまたいでも稼働0が続けば1つの連続区間として先頭のみ返す', () => {
    // 木(0),金(1),月(0),火(0) : 金だけ稼働ありで区間が分かれる
    const load = dailyLoad(
      [{ start: '2024-01-05', end: '2024-01-05' }],
      '2024-01-04',
      '2024-01-09',
    );
    expect(freeDayMarkers(load, '2024-01-04')).toEqual(['2024-01-04', '2024-01-08']);
  });

  it('全区間が空きなら土日をまたいでも先頭日1件のみ', () => {
    const load = dailyLoad([], '2024-01-04', '2024-01-09');
    expect(freeDayMarkers(load, '2024-01-04')).toEqual(['2024-01-04']);
  });

  it('todayより前の日は無視し、today以降のみを対象にする', () => {
    const load = dailyLoad(
      [{ start: '2024-01-05', end: '2024-01-05' }],
      '2024-01-04',
      '2024-01-09',
    );
    expect(freeDayMarkers(load, '2024-01-08')).toEqual(['2024-01-08']);
  });

  it('稼働ありの平日しかなければ空配列', () => {
    const load = dailyLoad(
      [{ start: '2024-01-01', end: '2024-01-05' }],
      '2024-01-01',
      '2024-01-05',
    );
    expect(freeDayMarkers(load, '2024-01-01')).toEqual([]);
  });
});
