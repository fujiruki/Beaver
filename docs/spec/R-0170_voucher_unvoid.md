# R-0170: 取消（void）した伝票を伝票画面から下書きに戻す

2026-10-11 藤田晴樹さん了承（仕様案「そのままでよい」）。Access側の扱いは dodai-back 回答済み（`docs/requests.md` §49）。

## 仕様
1. 取消（status=void）の伝票を開くと、伝票画面に「下書きに戻す」ボタンを出す（取消ボタンの代わり）。押すと確認ダイアログを出し、理由を入力できる（空欄可）。
2. API: `POST /vouchers/{id}/unvoid`（body `{reason}`）。void の伝票だけ受け付け、それ以外は 409。status を `draft` に戻し、updated_at を進める。`recordHistory($pdo, 'vouchers', $id, 'unvoid', before, ['reason'=>...], after)` で履歴を残す（R-0154 の void と同じ形）。R-0166 の `expected_updated_at` を受け付ける（beginVoucherWrite の既存の流れに乗せる）。
3. 戻したあとは通常の下書きとして編集できる。伝票一覧・伝票画面の表示も通常どおり。
4. Access側: 次の同期で競合待ちに入り、「Beaver版を採用」で Access 側も復活する（Access側の追加作業なし）。
5. R-0154 の「取消は戻せない」は「Beaverの画面からは『下書きに戻す』操作でだけ戻せる」に改める。空の伝票として物理削除したものは戻せない（データが無い）。

## テスト
- void の伝票を unvoid すると draft になり、updated_at が進み、record_history に unvoid と理由が残る。
- void 以外は 409。
- 画面: void の伝票に「下書きに戻す」が出て、確認→API 呼び出し→下書きとして編集できる状態になる。
