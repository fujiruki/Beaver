# R-0229: Beaver のデザインの決まりを1つにまとめる

- 状態: 本番反映済み（2026-11-02）
- 要望の原文: `docs/requests_log.md` の R-0229
- 決まりの正本: `docs/design/DESIGN_SYSTEM.md`（このタスクで作成済み）
- 次: R-0230（伝票の新規作成・編集画面のリデザイン）でこの決まりを使う

## 作るもの

1. **共通の CSS** `frontend/src/styles/beaver-ui.css`
   - `frontend/src/styles/projectDetail.css` から、DESIGN_SYSTEM.md の「2. 部品」に挙げたものを `bv-` の名前で移す。色・大きさの変数は `--bv-*`
   - 全体に効くルール（box-sizing・ボタンや入力欄の文字の継承・角丸なし・数値の矢印を消す など）は `.bv-ui` の中に閉じ込める。`bv-ui` の外（古い画面）は見た目が変わらないこと
   - 切り替えボタンは `pd-status*` を `bv-toggle*` に一般化する。表は `pd-sched`・伝票の表の共通部分を `bv-table` に一般化する
   - `frontend/src/main.tsx`（または App）で1回だけ読み込む
2. **案件詳細を共通の CSS に乗せかえる**
   - `projectDetail.css` には案件詳細だけの並べ方（`pd-layout`・`pd-key-grid`・`pd-customer-line`・`pd-effort`・`pd-work`・`pd-description`・予定の表だけの部品 など）を残す
   - `ProjectDetail.tsx`・`ProjectSchedulesPanel.tsx`・`CapacityCheckPanel.tsx`・`UndoToast.tsx` のクラス名を、共通部品は `bv-` に置きかえる。画面の一番外側に `bv-ui` を付ける
   - **見た目は変えない**（R-0227 の見本 v4 と同じ）
   - 見本 `docs/design/R-0227_project_detail_mock_v2.html` も `beaver-ui.css` と `projectDetail.css` の両方を読むように直し、クラス名を同じく置きかえる
3. **見本帳** `docs/design/ui-kit.html`
   - `beaver-ui.css` を相対パスで読む。DESIGN_SYSTEM.md の部品を1つずつ、ふだん・マウスを乗せた見え方の説明・入力中・空・読み取り専用・エラー・無効 などの状態ごとに並べる
   - 部品ごとに使う HTML の例（クラス名）を小さく添える
   - 数字の例は実在の顧客情報を使わない（仮の値でよい）
4. `CLAUDE.md`（Beaver）に1行: 「画面を作る・直すときは `docs/design/DESIGN_SYSTEM.md` を読み、good-design（v1.6）で進める」

## 共通にしないもの（今回）

- 自動保存と元に戻すの仕組み（フック）: 使っているのが案件詳細だけなので切り出さない。R-0230 で伝票の画面に2つ目の使い道ができたときに `frontend/src/hooks/` へ切り出す
- 部品の React コンポーネント化: まずは CSS のクラスで共通にする。同じ JSX の形が2画面以上で繰り返されたら部品にする

## 受け入れ条件

1. `cd frontend && npx vitest run`・`npx tsc -b`・回帰スイートが全部通る。クラス名の置きかえで落ちたテストは、確かめる中身を弱めずにクラス名だけ直す
2. 案件詳細の見た目が変わらない: 指揮役が置きかえ前と後の beta（または手元）を同じ案件・同じ幅で並べて見比べ、違いが無いこと
3. 古い画面（案件一覧・伝票編集など）の見た目が変わらない: 指揮役が置きかえ前と後で見比べる
4. 見本帳が開けて、部品がすべて出ている

## タスク

- [x] T0 DESIGN_SYSTEM.md を書く（指揮役）
- [x] T1 beaver-ui.css を作り、案件詳細と見本を乗せかえる・見本帳を作る・CLAUDE.md に1行
- [x] T2 見た目が変わらないことの確認（指揮役）

## T2 の結果（2026-11-02）

- 案件詳細: 本番（置きかえ前）と beta（置きかえ後）を同じ案件 61 で並べた。ステータスの項目名が上に1段ずれていた（`pd-status-area` の指定が `bv-toggle-area` に移っていなかった）→ 3850e1d で直し、同じになったことを確かめた。ほかはデータの違いだけ
- 古い画面: 伝票の編集（9711）を本番と beta で並べ、見た目の作りが同じ（共通の CSS がはみ出していない）
- 見本帳 `docs/design/ui-kit.html` が開け、部品が状態ごとに並んでいる
- Codex がコミットの直前で止まったため、指揮役がテスト・回帰スイートを確かめてコミットした（333fc6a・4352948）
