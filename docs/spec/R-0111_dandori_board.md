# R-0111: 段取りボード（案件ガントチャート）

## 目的

工房のみんなで画面を囲み、段取り会議をするためのボード。「この案件は間に合わない」「次はここから取りかかれる」「展示会のためにここを空けたい」という会話が画面上の情報だけで成立すること。Youkanのような詳細タスク分解はせず、**案件単位の粗い粒度**で期間を見る。

デザインの確定版モックアップ: `docs/spec/R-0111_mockup.html`（v3、藤田晴樹さん承認済み 2026-08-24）。実装はこのモックの見た目・密度・色を正とする。

## 画面

- ルート: `/dandori`、ナビに「段取り」を追加
- データソース: `GET /projects`（非ページング一覧。`customer_name`・`effective_estimated_hours` を含む）
- 保存: ドラッグ確定時に `PUT /projects/{id}`（`start_date` または `delivery_date` のみの部分更新）

## 表示仕様

### バー
- 開始位置: `start_date`。幅: 工数日数 = `ceil(effective_estimated_hours / hours_per_day)`、最低1日
- **土日は工数消化日に数えない**。バーは土日をまたいで伸びる（開始日が土日の場合、最初の消化日は次の月曜）
- 工数が0またはnullの案件は幅1日・薄色表示
- `start_date` がnullの案件はボードに表示しない（ヘッダーに「開始日未設定 n件」と件数のみ表示）
- バー内ラベル: 案件名（工数h）。日幅が狭いときは非表示（下記）

### 納期線
- `delivery_date` の位置に赤の縦線（3px）。**文字ラベルなし**。nullなら非表示
- バー終端が納期線より右に出る場合、超過部分を赤の斜線パターンで塗り、画面上部に「⚠ 納期注意 n件」バッジ

### 色の言語（モック凡例のとおり）
- 深緑 `#2f7d6d` = お客様の仕事（着手中）
- 点線・薄緑 = 未着手（まだ動かせる）
- 琥珀 `#b07a2e` = 社内の仕事（**得意先名に「社内」を含む案件**）
- 赤 `#c2453a` = 納期のことだけに使う
- 今日の列 = 薄黄ハイライト＋「今日」

ステータス名は `project_statuses` マスタ（動的）。実際の名称を確認し、「未着手系＝点線」「着手中系＝塗り」「完了・キャンセル系＝既定非表示（トグルで表示可）」の対応表をコード内の1箇所に定義すること。

### 行の密度
- 行高30px相当・バー上下余白2px。案件名と得意先名は1行に並べる（モックv3準拠）
- 文字サイズ調整（A−/A/A＋）をツールバーに設置。ルート要素のフォントスケール変数で行高も連動して伸縮。選択はlocalStorageに保存（既存のキー命名規則に合わせたプレフィックスを使用）

### 表示期間とズーム
- 既定: 今日を含む週の月曜の2週間前〜8週間先。プリセット「8週間 / 6ヶ月 / 1年」で範囲と日幅を切り替え
- ズームスライダー: 1日あたりのpx幅を無段階調整（目安2〜40px）
- 日幅が約12px未満: 日付の数字を消して月境界線＋月ラベルのみ。約10px未満: バー内ラベル非表示（左の案件名列で読む）

### 表示モード
- 横スクロールモード（既定）: 通常のガントチャート
- 折り返しモード: 週単位で時間軸を画面幅で折り返し、縦スクロールで読む。案件バーはレーン詰め、週をまたぐバーは分割して「◀続き／続く▶」マーク
- 折り返しモードは**v1では閲覧専用**（ドラッグ不可）。ドラッグは横スクロールモードで行う

### 稼働数の帯
- 日付軸の下（最下段）に平日ごとの稼働案件数をミニバー表示。2件以上は濃色
- 今日以降で稼働0の平日に空きマーカー。連続する空きは先頭に「M/D から空き」ラベル

### ドラッグ
- バーの水平ドラッグ → `start_date` 変更。納期線のドラッグ → `delivery_date` 変更
- 1日単位スナップ。ドロップ時に即 `PUT /projects/{id}` 保存。失敗時は元の位置に戻してエラー表示
- 楽観的更新（TanStack Query の既存パターンに合わせる）

## 設定: 1日あたり作業時間

**既存の `AppSettingsContext.hoursPerDay`（`bv_app_settings`、設定画面に入力欄あり）をそのまま使う。**バックエンド・DB変更なし。

（経緯: 当初はcompany_settingsへの列追加を計画したが、実装Agentの調査で同名・同目的の設定が既にフロントに存在すると判明。二重の設定源を避けるため既存設定を正とした。ブラウザごとのローカル設定だが、段取り会議は1つの画面を囲んで行う用途のため実用上問題ない。全端末共通にしたくなったらその時にDB化する。）

## 実装構成

| ファイル | 内容 |
|:--|:--|
| `frontend/src/lib/dandoriCalc.ts` | 純粋関数: 工数→営業日数、営業日加算（土日スキップ）、バー期間、日次稼働数、空き日検出 |
| `frontend/src/lib/__tests__/dandoriCalc.test.ts` | 上記のvitestテスト（TDD） |
| `frontend/src/pages/DandoriBoard.tsx` | 画面本体（ツールバー・ガント・折り返し・稼働帯） |
| `frontend/src/App.tsx` | ルート追加 |
| `frontend/src/components/AppLayout.tsx`（相当） | ナビ「段取り」追加 |
| （バックエンド変更なし） | hours_per_dayは既存の`AppSettingsContext`を使用 |

### dandoriCalc.ts の関数仕様（実装Agent間の合意インターフェース）

```ts
// 工数(h)→営業日数。ceil、最低1。hoursがnull/0でも1
export function workdaysFromHours(hours: number | null, hoursPerDay: number): number
// startISO(YYYY-MM-DD)から営業日workdays日ぶんを消化した最終日(YYYY-MM-DD)。土日スキップ。開始が土日なら次の月曜から消化
export function barEndDate(startISO: string, workdays: number): string
// 範囲内の平日ごとの稼働案件数。keyはYYYY-MM-DD
export function dailyLoad(bars: {start: string; end: string}[], rangeStart: string, rangeEnd: string): Map<string, number>
// 今日以降の稼働0平日のうち、連続区間の先頭日リスト
export function freeDayMarkers(load: Map<string, number>, todayISO: string): string[]
```

## 実機確認フィードバック対応（2026-08-24、藤田晴樹さんより）

原文: 「beaver全体の左右スクロールと、ガントチャート内の左右スクロールが表示されている。beaver内の左右スクロールは表示されないようにして。それと、表示されている案件の数が以上に少ないように見えるがどうしてだろうか？」

- **F1: ページ全体の横スクロール禁止**: 原因は `AppLayout.tsx` の `<main style={{flex:1}}>` にflexアイテムの既定 `min-width:auto` が効き、中身のガント固定幅より縮まないこと。`minWidth: 0` を追加し、横スクロールはガント内（`.gantt-scroll`）のみに閉じる
- **F2: 開始日未設定の案件の可視化**: 表示案件が少なく見えるのは開始日未入力の案件が「開始日未設定 n件」に集約されるため（仕様どおり）。対策として、ボード下に開始日未設定の案件一覧（案件名・得意先・納期、完了/キャンセル系は表示トグルに従う）を表示し、各行の「今日に置く」ボタンで `start_date=今日` を保存して即バー化できるようにする

### 追加フィードバック（2026-08-24、F2確認後）

原文（ローマ字入力）: 「iikangaeda. kyounioku botann no migigawani tuginotorikakareruhini oku botannwo tukete . soreto, kaisibimisetteinoanken mo hyoukeisikino moju-ru wo tukatte. sousitara so-tomodekiruyouninattebenridayone.sosite retunohabamo setteidekiruyouninarusi. sokoni kousuu no puropateli mo tukete.」

- **F3: 「次の空きに置く」ボタン**: 「今日に置く」の右に「次の空きに置く」を追加。表示中のバー（完了/キャンセル除く）の稼働から、今日以降で稼働0の最初の平日を求めて `start_date` に保存する。純関数 `nextFreeDay(bars, todayISO)` として切り出しテストを書く（全バー終了後は最終バー翌営業日、バーが無ければ今日）
- **F4: 開始日未設定一覧をDataTable化**: 既存の `DataTable` コンポーネント（ソート・列幅ドラッグ対応）で表示する。列: 案件名 / 得意先 / 納期 / 工数(h・右揃え、R-0106に倣う) / 操作（今日に置く・次の空きに置く）。既定ソートは納期昇順

## 受け入れ条件

1. `/dandori` で開始日ありの案件がバー表示される（開始日・工数・納期は既存データをそのまま使用）
2. バー幅 = `ceil(工数 / hours_per_day)` 営業日、土日をまたぐ
3. 納期赤線（ラベルなし）、超過は赤斜線＋「⚠ 納期注意 n件」バッジ
4. バードラッグで開始日、赤線ドラッグで納期が即保存される。API失敗時はロールバック
5. 表示期間プリセット（8週間/6ヶ月/1年）・ズームスライダー・文字サイズ（A−/A/A＋）が機能する
6. 折り返しモードで週単位に折り返して閲覧できる
7. 稼働数の帯と空きマーカーが表示される
8. 社内案件は琥珀、未着手は点線、完了・キャンセル系は既定非表示（トグルあり）
9. `dandoriCalc` のvitestテストが追加され、回帰スイート（vitest全件＋PHPテスト）がグリーン

## 検証方法

```bash
cd frontend && npx vitest run
cd api && php tests/test_sync.php ほか既存PHPテスト
cd frontend && npm run build
```

ブラウザ: http://localhost:5178/contents/Beaver/dandori で表示・ドラッグ・モード切替を目視確認。
