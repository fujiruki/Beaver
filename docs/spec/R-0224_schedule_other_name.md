# R-0224: 予定の種類で「その他」を選んだときに工程名を入れる

- 状態: 仕様化済み（2026-10-30）
- 要望の原文: `docs/requests_log.md` の R-0224
- 関係する仕様: R-0220（案件の予定）、R-0222（決まった種類の行・時間）

## 今の動き

- 予定の種類が「その他」だと、段取りのバー・◆・やること一覧には「その他」とだけ出る
- メモ（`memo`）はバーのツールチップとやること一覧の括弧にしか出ない

## 仕様

- `project_schedules` に `name TEXT NOT NULL DEFAULT ''` を足す（migration 042、ALTER TABLE ADD COLUMN のみ。データは書き換えない）
- API（`api/routes/project_schedules.php`）の POST/PUT で `name` を受け取り、GET で返す。PUT でキーが無ければ今の値を残す（`memo` と同じ扱い）
- 工程名は種類が「その他」のときだけ使う。ほかの種類で送られた `name` は保存するが表示には使わない（種類を「その他」に戻したときに残っているように）
- 入力欄
  - 案件の画面の予定の表（`ProjectSchedulesPanel.tsx`）：種類が「その他」の行では、種類のセレクトの右（同じセル内）に「工程名」の入力欄を出す。確定は blur（メモと同じ）
  - 段取りの「予定を追加」（`ScheduleAddModal.tsx`）：種類が「その他」のとき「工程名」の欄を出す
- 表示：種類が「その他」で工程名が空でなければ、種類名のかわりに工程名を出す
  - `scheduleLabel`（`dandoriBoardUtils.ts`）と `scheduleTitle`（`GanttScroll.tsx`）。表示用の種類名を返す小さな関数を1つ作り、両方から使う
  - 色やバーの形は「その他」のまま
- 工程名は必須にしない。空なら今までどおり「その他」と出す

## 受け入れ条件

1. API: 「その他」の予定を `name` 付きで作ると GET で返る。PUT で `name` を送らなければ値が残る（PHP テスト）
2. `scheduleLabel` が「その他」＋工程名なら工程名を、ほかの種類なら種類名を返す（vitest）
3. 回帰スイートが全部通る

## タスク

- [x] T1 PHP テストと vitest を先に書く（赤）
- [x] T2 migration 042 と API
- [x] T3 型・入力欄・表示
- [ ] T4 ブラウザでの確認
