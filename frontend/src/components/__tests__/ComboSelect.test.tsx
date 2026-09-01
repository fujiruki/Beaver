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

describe('ComboSelect Enter選択 (R-0114)', () => {
  it('複数候補でハイライトなしにEnterを押すと、表示中候補の一番上で確定する', () => {
    let selected: number | null = null;
    const input = renderCombo(id => { selected = id; });

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '田中' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(selected).toBe(1); // filtered配列の先頭（田中商店）
  });

  it('漢字変換確定のEnter（isComposing）では候補を確定しない', () => {
    let selected: number | null = null;
    const input = renderCombo(id => { selected = id; });

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '田中' } });
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });

    expect(selected).toBe(null);
  });

  it('漢字変換確定のEnter（keyCode 229）では候補を確定しない', () => {
    let selected: number | null = null;
    const input = renderCombo(id => { selected = id; });

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '田中' } });
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 229 });

    expect(selected).toBe(null);
  });
});

describe('ComboSelect スペース区切りAND検索 (R-0115)', () => {
  it('スペース区切りの全トークンにマッチする候補のみに絞り込む', () => {
    const input = renderCombo();

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '田中 製作所' } });

    expect(screen.getByText('田中製作所')).toBeTruthy();
    expect(screen.queryByText('田中商店')).toBeNull();
    expect(screen.queryByText('鈴木商店')).toBeNull();
  });

  it('ひらがな入力でカタカナ相当の候補にマッチする（かな正規化）', () => {
    const kanaOptions: ComboOption[] = [
      { id: 1, primaryText: '田中商店', searchText: 'タナカショウテン' },
    ];
    let selected: number | null = null;
    render(<ComboSelect options={kanaOptions} value={null} onChange={id => { selected = id; }} placeholder="選択" />);
    const input = screen.getByPlaceholderText('選択') as HTMLInputElement;

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'たなか' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(selected).toBe(1);
  });
});

describe('ComboSelect 半角カタカナ検索 (R-0135)', () => {
  const kanaOptions: ComboOption[] = [
    { id: 1, primaryText: '門田組', searchText: '門田組 ｶﾄﾞﾀｸﾞﾐ' },
  ];

  function renderKanaCombo() {
    let selected: number | null = null;
    render(<ComboSelect options={kanaOptions} value={null} onChange={id => { selected = id; }} placeholder="選択" />);
    return {
      input: screen.getByPlaceholderText('選択') as HTMLInputElement,
      getSelected: () => selected,
    };
  }

  it('半角カタカナのsearchTextがひらがな検索語にヒットする', () => {
    const { input, getSelected } = renderKanaCombo();

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'かどた' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(getSelected()).toBe(1);
  });

  it('半角カタカナのsearchTextが全角カタカナ検索語にヒットする', () => {
    const { input, getSelected } = renderKanaCombo();

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'カドタ' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(getSelected()).toBe(1);
  });
});
