import { describe, it, expect } from 'vitest';
import { nextKanaValue } from '../kanaAutoFill';

describe('nextKanaValue (R-0113)', () => {
  it('「冨永」→「とみなが」に続けて「総業」→「そうぎょう」を確定すると、追記されて「とみながそうぎょう」になる', () => {
    const afterFirst = nextKanaValue('', 'とみなが', false);
    expect(afterFirst).toBe('とみなが');

    const afterSecond = nextKanaValue(afterFirst, 'そうぎょう', false);
    expect(afterSecond).toBe('とみながそうぎょう');
  });

  it('フリガナ欄を手動編集済み（ロック中）なら自動追記しない', () => {
    expect(nextKanaValue('とみなが', 'そうぎょう', true)).toBe('とみなが');
  });

  it('確定分のよみが取得できていない場合は変化しない', () => {
    expect(nextKanaValue('とみなが', '', false)).toBe('とみなが');
  });
});
