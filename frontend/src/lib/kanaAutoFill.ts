/**
 * R-0113: 得意先名のIME確定ごとに、よみがなを追記していくための純関数。
 * 旧実装は確定のたびに currentKana を capturedReading で上書きしており、
 * 2回目以降の確定で直前の読みが消えるバグがあった。
 */
export function nextKanaValue(currentKana: string, capturedReading: string, kanaLocked: boolean): string {
  if (kanaLocked || !capturedReading) return currentKana;
  return currentKana + capturedReading;
}
