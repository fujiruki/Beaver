import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ComboSelect, { type ComboOption } from '../ComboSelect';

const OPTIONS: ComboOption[] = [
  { id: 1, primaryText: '田中商店', searchText: '田中商店' },
  { id: 2, primaryText: '田中製作所', searchText: '田中製作所' },
  { id: 3, primaryText: '鈴木商店', searchText: '鈴木商店' },
];

function renderCombo(onChange = (_id: number | null) => {}) {
  render(
    <ComboSelect options={OPTIONS} value={null} onChange={onChange} placeholder="選択" />
  );
  return screen.getByPlaceholderText('選択') as HTMLInputElement;
}

describe('ComboSelect Enter選択 (R-0083)', () => {
  it('検索結果が1件に絞られた場合、ハイライト操作なしにEnterでその1件を選択する', () => {
    let selected: number | null = null;
    const input = renderCombo(id => { selected = id; });

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '鈴木' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(selected).toBe(3);
  });

  it('検索結果が複数件のままEnterを押しても、ハイライトなしでは何も選択されない（既存動作を維持）', () => {
    let selected: number | null = null;
    const input = renderCombo(id => { selected = id; });

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '田中' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(selected).toBe(null);
  });

  it('複数候補でも矢印キーでハイライトしてからEnterを押せば従来どおり選択できる', () => {
    let selected: number | null = null;
    const input = renderCombo(id => { selected = id; });

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '田中' } });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(selected).toBe(1);
  });
});
