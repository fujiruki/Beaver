import { describe, it, expect, afterEach } from 'vitest';
import { installEmptyDateMarker } from '../emptyDateMarker';

const tick = () => new Promise(r => setTimeout(r, 0));

describe('emptyDateMarker（R-0273）', () => {
  let stop: () => void;
  afterEach(() => { stop?.(); document.body.innerHTML = ''; });

  it('空の日付欄に data-empty が付き、値を入れると外れ、消すと戻る', () => {
    document.body.innerHTML = '<input id="a" type="date"><input id="b" type="date" value="2026-11-01">';
    stop = installEmptyDateMarker(document);
    const a = document.getElementById('a') as HTMLInputElement;
    const b = document.getElementById('b') as HTMLInputElement;
    expect(a.hasAttribute('data-empty')).toBe(true);
    expect(b.hasAttribute('data-empty')).toBe(false);
    a.value = '2026-11-02';
    a.dispatchEvent(new Event('input', { bubbles: true }));
    expect(a.hasAttribute('data-empty')).toBe(false);
    a.value = '';
    a.dispatchEvent(new Event('input', { bubbles: true }));
    expect(a.hasAttribute('data-empty')).toBe(true);
  });

  it('あとから描かれた日付欄にも付く。日付以外には付かない', async () => {
    stop = installEmptyDateMarker(document);
    document.body.innerHTML = '<input id="c" type="date"><input id="d" type="text">';
    await tick();
    expect(document.getElementById('c')!.hasAttribute('data-empty')).toBe(true);
    expect(document.getElementById('d')!.hasAttribute('data-empty')).toBe(false);
  });
});
