import { useCallback } from 'react';

// R-0248: 一覧の検索欄が画面に出たときにカーソルを置く。入力済みの語は選択状態にする
// 読み込み中は検索欄ごと描画されない画面があるため、マウント時ではなく要素の取り付け時に実行する
export function useAutoFocusSearch() {
  return useCallback((el: HTMLInputElement | null) => {
    if (!el) return;
    el.focus({ preventScroll: true });
    el.select();
  }, []);
}
