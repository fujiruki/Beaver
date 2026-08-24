import { describe, it, expect } from 'vitest';
import { estimateLabelWidth } from '../GanttScroll';

describe('estimateLabelWidth', () => {
  it('短いラベルは狭いバーにも収まらない幅と判定される（padding込み）', () => {
    expect(estimateLabelWidth('')).toBe(20);
  });

  it('文字数が増えるほど推定幅も増える', () => {
    expect(estimateLabelWidth('AB')).toBeGreaterThan(estimateLabelWidth('A'));
  });

  it('狭いバー幅では長いラベルが収まらないと判定できる', () => {
    const label = '客室建具改修 12室（64h）';
    expect(estimateLabelWidth(label)).toBeGreaterThan(48); // 2日分(24px*2)のバー幅より広い
  });
});
