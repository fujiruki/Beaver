# 要望・リクエスト

## 39. R-0155: Access⇔Beaverの同期・競合解消を「得意先→案件→伝票」の順にする（2026-10-09、藤田晴樹さんより会話内で直接）

A-X-01の手順8（Beaver_betaの試用伝票E02046・E02047をAccessの競合解決画面で「Beaver版を採用」）の最中に出た要望。藤田晴樹さんの原文:

> そういえば同期の処理って、得意先の同期を先にしてから伝票の同期をしたほうが順序として正しそうだけど・・・どうおもう？　得意先・案件・伝票　の順で同期・競合解消下ほうが良さそうなきがする。それらの順番をかんがえなおしてみて

- 同期処理の本体はAccess側（AccessTategu `Df_Beaver連携.bas`）にあるため、2026-10-09 dodai-backへ現状の順番の確認と見直しを相談
- あわせて「1，ぎゃくにそうやってbeaverでの編集と同期がテストできるからそれいいね」（E02046の仮の得意先「とりあえず登録用」は、採用後にBeaverで正しい得意先へ付け替え、Beaver→Accessの編集同期のテストにする）

状態: dodai-backの回答待ち

## 38. R-0153: 伝票編集画面の合計プレビューをR-0152の計算規則に揃える（2026-10-06、dodai-back[AccessTategu側backpc指揮役]より。Dodaikun乗り換え前に必ず直す）

R-0152（`docs/spec/R-0152_recalc_voucher_access_parity.md`）の確認の中で見つかった、フロントエンド側の同じ誤り。dodai-backの回答原文:

> 補足（フロント表示）: 別要望に分けて構いませんが、Dodaikun 乗り換え（Beaver が正本になる）までに必ず直す項目として Beaver 側の要望一覧に登録してください。古い伝票を開くと誤った合計がプレビューされるため。

- `frontend/src/pages/VoucherEdit.tsx:597`で`TotalSummary`に`taxRate={0.10}`を固定で渡している（基準日の税率になっていない）
- `frontend/src/lib/voucherCalc.ts`の`calcVoucherTotal`が値引行の合計を符号そのままで差し引いている（負数の値引が加算になる）。`外税/請求計`の税0、0方向の切り捨ても未対応
- 保存される`total_amount`はサーバー側（R-0152）で正しくなるので、影響は画面のプレビュー表示のみ

状態: 未着手（R-0152の完了後に仕様化する）

## 37. R-0150のBeaver_beta・本番反映、既存データ修正の事前確認、明細同期（access_line_id）の抜本修正（2026-10-06、dodai-back[AccessTategu側backpc指揮役]より、藤田晴樹さん了承済み）

dodai-backからのクロスセッション依頼原文（要約せず記録）:

> R-0150 ありがとうございます。晴樹さんから「本番への反映も許す」と了承が出ました。R-0150 は Beaver_beta・本番へ反映してください。データ修正 `r0150_fix_consumption_tax_type.php --execute` は、本番の6件（id 5805〜5810）が本当にテストデータか（内容・作成日時）を読み取りで確認して晴樹さんに提示してから、晴樹さんの判断で実行してください（なぜ本番にbetaと同じテスト伝票があるのかも分かれば教えてください）。
>
> 続けて、次の明細同期の修正をお願いします（fableレビューに基づき晴樹さん承認済み。詳細は AccessTategu の docs/R-086_切替前チェックリスト_教訓.md §0）。
>
> 【背景】Access「Beaver版採用」で Beaver のみの伝票を取り込むと、access-link（sync_helpers.php:863-947）はヘッダの access_voucher_id のみ書き戻し、明細の access_line_id は NULL のまま（Beaver_beta で 12102〜12108 の7伝票17行）。また Access の Push は常に `lines_mode:"replace"` を送り（Access Df_Beaver連携Push.bas:175,322）、Beaver は replace で明細を全DELETE→INSERT（sync_helpers.php:421-460）するため、voucher_line_costs/prices が CASCADE で消え、Beaver の明細 id も振り直される。edited_in_beaver 保護は Access 経路では実質無効。
>
> 【依頼（TDD）】
> 1. access-link API に任意の `lines:[{line_no, access_line_id}]` を追加。仕様: ヘッダ更新と同一トランザクション／line_no が当該伝票に存在しない・重複・ユニーク索引(voucher_id, access_line_id)抵触は 422 で全件ロールバック（部分適用禁止）／既に同じ値なら冪等に200、別の値で既にリンク済みなら409／明細の updated_at・edited_in_beaver は変更しない（変えると次回pullで誤検知）。lines 無しのリクエストは従来どおり動くこと（Access側は並行して実装し、送り始めます）。
> 2. GET の明細に Beaver 側の明細 id を含める（vouchers.php:146 付近。キー名を決めたら教えてください）。
> 3. Access→Beaver の明細 replace を access_line_id キーの upsert に変更: 一致=UPDATE（Beaver 行 id と costs/prices 子行を維持）、payload にあって Beaver に無い access_line_id=INSERT、Beaver 側にあって payload に無い行（access_line_id NULL の行も含む）=DELETE（Access採用=Access版が正）。edited_in_beaver 保護は外し、仕様書を実態に合わせる。lines_mode の扱いは互換を保つ形で判断してください。
> 4. 既存17行の修復スクリプト（dry-run既定、--execute は晴樹さん実行）。対応表（Access伝票: line_no→Beaver明細id:Access明細id）:
> 12102: 1→25485:25760, 2→25486:25761, 3→25487:25762 / 12103: 1→25492:25771 / 12104: 1→25493:25764, 2→25494:25765, 3→25495:25766 / 12105: 1→25496:25767, 2→25497:25768, 3→25498:25769, 4→25499:25770 / 12106: 1→25488:25772, 2→25489:25773 / 12107: 1→25490:25774, 2→25491:25775 / 12108: 1→25352:25776, 2→25353:25777
> 条件: `WHERE id=? AND voucher_id=? AND access_line_id IS NULL`、事前に item_name・line_total がAccess側と一致することを確認（不一致なら中止）、バックアップ取得、実行後17件を照合。Access側の値が必要ならこちらで出します。
>
> 完了したら API の最終仕様（リクエスト/レスポンス例）を教えてください。Access側はそれに合わせます。

### 対応方針（検討中）
- R-0150のデプロイ: Beaver_betaは自動実行可（既存方針）。**本番への反映はdodai-back経由の間接承認のみでは実行せず、指揮役から藤田晴樹さん本人へ直接確認してから行う**（2026-09-25の無関係デプロイによる緊急インシデントの教訓を踏まえ、本番書き込み系は都度確認を徹底）。藤田晴樹さんに確認し、本番・Beaver_beta両方へのデプロイ・本番6件のデータ修正実行とも承認済み（2026-10-06）。ただしupload.ps1の実行がClaude Code auto modeの権限フィルタ（Auto-Mode Bypass）でブロックされ、権限設定の調整も自己拡張になるため同フィルタでブロックされた。**デプロイはユーザー本人が実行するか、ユーザー自身が設定ファイルを編集する必要あり**
- R-0150データ修正（本番6件）: 読み取り確認の結果、6件中3件（5805,5808,5810）は実在の得意先の実データ（青木・門田組・竹本工務店）、2件（5806,5807）がテストデータ、1件（5809）はプレースホルダー得意先。全て2026-09-27のBeaver_beta再clone（本番→ベータ複製）で本番の未完了draft伝票がそのままコピーされたもので、異常ではない。晴樹さん確認・実行承認済み
- 明細同期の抜本修正（1〜4）: 新規要望としてSdDD手順に従い仕様化してから実装（規模が大きく、過去の同期障害の教訓もあるため拙速な実装を避ける）。着手中

### 追加調査依頼（2026-10-06、dodai-backより、sync_reconcile.ps1による横断整合検査）
1. Beaver_beta売上3,945件中3,814件がtotal_amount=0/NULL、全件がaccess_voucher_id設定済み（Access同期経由）。原因調査: `recalcVoucher()`（明細からヘッダー合計を再計算する関数、`api/routes/vouchers.php`）はBeaver UI経由の通常操作でのみ呼ばれており、`sync_helpers.php`のAccess push受信経路（`syncVoucherUpsert`/`syncVoucherUpdate`）では一切呼ばれていない。**不具合と判断**（仕様ではない）。画面・請求書・集計は保存された`total_amount`をそのまま信頼する設計のため実害あり
2. 売上4274(Beaver 9335)のtotal_amount=15180が誤り（正: 10120、晴樹さん確認済み）。`POST /vouchers/{id}/reload-snapshots`エンドポイントが内部で`recalcVoucher()`を呼ぶため、再計算の回避策として使える（Access同期済み明細はtategu_item_id全件NULLのためスナップショット再読込部分は安全にno-op）。dodai-backへ回答済み
3. 恒久対応は明細同期の抜本修正と同じ`sync_helpers.php`の改修タイミングで、`syncVoucherUpsert`/`syncVoucherUpdate`に`recalcVoucher()`呼び出しを追加する方針

### 本番の実害確認結果（2026-10-06、dodai-backへ回答済み）
本番は現時点で実害ゼロ。本番`invoices`・`invoice_vouchers`とも0件（請求書機能未使用）。本番sales総数3,907件中total_amount=0/NULLは22件のみで、全件`access_voucher_id=NULL`（Access同期未経由）・`created_at=2026-03-17 20:04`台・`voucher_no`が`U0xxxx`形式。Beaver_betaで既に削除済みの単発seed/インポートの痕跡と同一由来で、recalcVoucher未呼び出しバグとは無関係。影響はAccess同期テストを実施しているBeaver_betaに限定、A-X-02本番切替前に恒久対応を完了させれば本番への実害は防げる。

### 追加依頼（2026-10-06、dodai-backより、方針合意済み）
- `syncVoucherUpsert`/`syncVoucherUpdate`の明細反映後に`recalcVoucher()`を呼ぶ（Accessが送る`total_amount`を信頼しない）
- 既存データの一括修復スクリプト（dry-run既定・`--execute`は晴樹さん実行、事前バックアップ、`updated_at`は変更しない、対象件数と前後の値を出力）をBeaver_beta・本番の両方向けに、`reload-snapshots`の副作用に頼らず`recalcVoucher`を直接呼ぶ形で用意する
- 完了報告は明細同期のAPI最終仕様とまとめて行う

dodai-backからのクロスセッション依頼原文（要約せず記録）:

> Beaver伝票作成画面の消費税区分の初期値バグについて、修正をお願いします（AccessTategu側セッションから、晴樹さん了承済みの依頼です）。
>
> 【症状】frontend/src/pages/VoucherEdit.tsx:103 で、伝票見出しの consumption_tax_type の初期値が '課税' になっている。'課税' は明細の tax_category 用の値で、見出しの値は '外税/伝票計' / '外税/請求計' 等。DBの既定値（api/schema.sql:154）は '外税/伝票計'。Beaverで新規作成した伝票が '課税' になり、AccessのBeaver版採用でそのまま混入した（Access beta の 12102〜12107。Access側は '外税/伝票計' に修正済み）。
>
> 【お願い】
> 1. VoucherEdit.tsx の初期値を '外税/伝票計' に修正
> 2. 可能ならAPI（vouchers作成/更新・同期受信）で見出しの consumption_tax_type に '課税' 等の定義外の値を受け付けないバリデーション
> 3. Beaver_beta の vouchers で consumption_tax_type='課税' の件数を読み取りで確認し、'外税/伝票計' へ直す手順を用意（サーバー書き込みは晴樹さんが実行する運用。直す際は updated_at を進めるとAccess側に再度競合として上がる点に注意。進めない方がよい）
> 4. 本番Beaverにも同じ値の伝票があるか確認
>
> 【背景】区分値のコードマスタ化（両システム共通の定義表・定数化・入口での検証）は AccessTategu の要望 R-152 として Dodaikun 乗り換え直前に実施予定。今回は最小限の修正のみ。

### 調査結果
仕様化: `docs/spec/R-0150_consumption_tax_type_default_fix.md`。

- `VoucherEdit.tsx:103`の`defaultValues.consumption_tax_type: '課税'`が原因と確認（DB既定値・バックエンドのフォールバックは元々正しく`外税/伝票計`）
- 許容値は4種類（`外税/伝票計`・`外税/請求計`・`内税/伝票計`・`内税/請求計`、`tools/migrate/02_import_to_beaver.php`の`mapTaxType()`に列挙あり）
- 本番Beaver・Beaver_beta（2026-10-06読み取り確認）とも同じ6件（id 5805〜5810、`E02041`,`E02044`〜`E02047`,`S04600`、いずれも`status='draft'`のテストデータ）が`consumption_tax_type='課税'`。Beaver_beta側は`access_voucher_id`12102〜12107としてAccess側に同期済み（dodai-back報告の件と一致）
- 対応: (1)フロントエンド初期値修正 (2)バックエンド4箇所に値域バリデーション追加 (3)既存データ修正用dry-run/--executeスクリプトを用意（`updated_at`は更新しない設計、実行は藤田晴樹さん本人）

dodai-backからのクロスセッション依頼原文（要約せず記録、2通）:

> 正式な修正依頼です（先ほどの取り消しとは別の、本当に必要な修正です）。
>
> ## 問題
> `/vouchers/sync`エンドポイント(api/routes/vouchers.php:89-100のSELECT)が、得意先情報として`access_customer_no`（Access側の番号、c.access_customer_noのLEFT JOIN）だけを返しており、**Beaver側の生の得意先名(`customers.name`)を一切含んでいません**。
>
> このため、AccessTategu側の競合解決画面(`frm競合解決`)で、まだAccessとリンクされていない新規得意先の伝票を見ると、Beaver版の得意先名が永遠に「該当なし」としか表示されず、見積/売上の内容を比較・判断する材料がありません（実例: 得意先「青木」さんの新規見積がこの状態でした）。
>
> 一方、Beaver内部の通常の伝票一覧用クエリ(vouchers.php:539等)は`c.name AS customer_name`を普通に取得しているので、同期専用エンドポイントだけがこの情報を落としています。
>
> ## 依頼内容
> `/vouchers/sync`のSELECT文に、生の得意先名も追加してほしいです。フィールド名案: `beaver_customer_name`（AccessTategu側は既存の`customer_access_no`と対にして`beaver_customer_name`を参照する実装にする想定です）。
>
> 同様の構造が`/customers/sync`や他の同期系エンドポイント(projects等)にもあれば、横展開をご検討ください。
>
> 対応可能か、またフィールド名案に異存がないか教えてください。合わせてAccessTategu側（ResolveBeaverCustomerName関数）も修正に着手します。

> 追記です。同じ問題が案件名にもあります。`/vouchers/sync`のSELECT文(vouchers.php:89-100)には`project_id`はありますが、projectsテーブルとのJOIN自体が無く、`access_project_no`も生の案件名(`projects.name`)もどちらも取得されていません（得意先より状態が悪いです）。
>
> 依頼をまとめます。`/vouchers/sync`のSELECT文に追加してほしいもの：
> - `c.access_customer_no AS customer_access_no`（既存）＋ `c.name AS beaver_customer_name`（新規）
> - projectsテーブルとのLEFT JOINを追加し、`p.access_project_no AS project_access_no`（新規）＋ `p.name AS beaver_project_name`（新規）
>
> AccessTategu側は、Access側とのリンクが取れればそちらの名前を優先、取れなければ`beaver_customer_name`/`beaver_project_name`を表示する形にする想定です。よろしくお願いします。

### 調査結果・回答（技術的訂正あり）
- `beaver_customer_name`追加は問題なく対応可能（`vouchers.php:89-100`の既存`customers` LEFT JOINに`c.name`を1列追加するだけ）
- **`access_project_no`は存在しない・不要**: `docs/from_access/20260906_R-086_Beaverスキーマ対応表.md`§2.2の既存調査により、案件IDはAccess/Beaver間で**共通ID**（`projects.id`をAccess側`案件番号`としてそのまま使用、`sync_helpers.php`の`resolveProjectIdById`参照）と判明済み。Beaver側にAccess案件ID用の別列（`access_project_id`等）は存在しない設計。SELECTに既にある`v.project_id`自体が共通IDの役割を果たすため、新規に`project_access_no`列を追加する必要はない。projectsテーブルへのLEFT JOINを追加し`p.name AS beaver_project_name`のみ返せばよい
- 横展開: `/customers/sync`（`customers.php`）は既に`name`を直接SELECT済み（customers自身のエンドポイントのためJOIN不要）、`/projects/sync`も同様に自テーブルのnameを直接返しているため、どちらも対応不要。同種の間接参照ギャップは`/vouchers/sync`のみと確認

原文: 「案件に紐づいて伝票がつくられるときには　その案件の得意先がその伝票の得意先にもデフォルトとして設定されるようにしてね」

### 調査結果
案件詳細画面（`ProjectDetail.tsx`）の「新規見積」「新規売上」ボタンは、既に`customer_id`をURLクエリ（`/vouchers/new?project_id=...&customer_id=...`）で渡しており、この経路では得意先が引き継がれる。一方、伝票編集画面（`VoucherEdit.tsx`）内の案件プルダウン（`VoucherHeader.tsx`の`project_id`select）で新規伝票作成中に案件を直接選択した場合は、得意先が自動設定されない抜けがある。

### 対応方針
新規伝票作成時（`isNew`）に限り、案件プルダウンで案件を選択した際、得意先が未設定（空）であれば選択した案件の`customer_id`を自動セットする。既に得意先が設定されている場合は上書きしない。既存伝票の編集（案件を後から変更するケース）は対象外（意図しない得意先の書き換えを避けるため）。

## 33. 得意先名なしで伝票（見積/売上）が登録できてしまう（2026-10-04、dodai-back[AccessTategu側backpc指揮役]経由で藤田晴樹さんより）

dodai-backからのクロスセッション依頼原文（要約せず記録）:

> AccessTategu側から機能要望です。晴樹さんより: 「Beaver側で得意先名なしの伝票（見積/売上）が登録できてしまう。得意先名なしでの登録はできないようにしてほしい」
>
> 経緯: AccessTategu⇔Beaver連携のベータ同期テストで、得意先未設定の売上伝票(Beaver ID=5792, 2026-07-09, 障子張替え, ¥25,740)が見つかりました。既存の「谷本紀男大工」宛の伝票(S04594, 同日・同金額・同摘要)と内容が酷似しており、得意先選択を忘れたまま保存されたものと推測されます。
>
> 技術的な確認済み事項（AccessTategu側で調査）:
> - `api/migrations/012_vouchers_customer_id_nullable.sql`で`vouchers.customer_id`のNOT NULL制約は意図的に外されている（コメント: 「過去伝票モード（project_id=NULL）のAccessTategu pushを受け入れるため」）
> - フロントエンド`VoucherEdit.tsx`にも得意先必須のバリデーションは無い
>
> 対応方針の検討をお願いします（例: 「過去伝票モード」等の特殊経路は許可しつつ、通常の新規作成UIでは得意先選択を必須にする、等）。既存の過去伝票モードの用途を壊さない形での対応が必要です。

### 取り消し（2026-10-04、dodai-backより訂正）

> 訂正です。先ほどの「得意先名なしでの登録を防止してほしい」という要望は取り消してください。
>
> 調査の結果、該当の伝票には実際には得意先名(「青木」)がちゃんと設定されていたことが判明しました。AccessTategu側の競合解決画面で「該当なし」と表示されていたのは、その得意先自体がまだAccess側とリンクされておらず(`access_customer_no`未設定)、`customer_access_no`がAPIレスポンスでNULLになっていたためでした。これはAccessTategu側の得意先承認処理のタイミングの問題で、Beaver側の実装に問題はありませんでした。お手数をおかけしました。

誤報と判明したため対応不要。Beaver側のコード調査（POST/PUT /vouchers・VoucherEdit.tsx・sync_helpers.phpの経路分離）は完了済みだが、今回は実装に至らず終了。ユーザーへの確認質問（PUT/convert-to-sales時の扱い）への回答は得ていたが、要望取り消しのため不要になった。

## カンガルーの　藤田建具店_プロジェクト管理_用語集.md　を読んで。用語集をこちらの用語集に取り込んで

## 32. 無効化得意先（is_active=0）が`GET /customers/sync`経由でAccess側に誤って「新規」として同期される（2026-09-08発覚、優先度低・急ぎではない）

R-0143 A-B-10（重複得意先統合）でis_active=0・access_customer_no=NULLに無効化したcustomer 4件が、Dodaikunの手順7「Beaverと同期」実行時にAccess側のtbl競合待びに「種別=new」として積まれた。

### 原因
`api/routes/customers.php`の`GET /customers/sync`（142〜186行目付近）は`updated_after`でフィルタするのみで、`is_active`による除外が無い。A-B-10で無効化した際に`updated_at`が更新されるため、増分同期に含まれてしまう。`access_customer_no`がNULLのため、Access側は既存customerとのマッチングキーが無く「新規」と誤認識する。

### 対応方針（未着手、Dodaikunと設計要相談）
- `GET /customers/sync`のレスポンスから`is_active=0`の行を除外する（ただしAccess側で既に同期済みの得意先が後からBeaver側で無効化されたケースを正しく伝播できなくなる可能性があり、要件整理が必要）
- 代替案: `is_active=0`かつ`access_customer_no IS NULL`の行のみ除外する（統合・無効化専用のケースに限定）
- Dodaikun（AccessTategu側）からの提起。急ぎではないとのことなので、次回のR-0143関連作業のタイミングで設計を詰める

## 31. A-B-10・A-B-12: R-0140派生タスク（2026-09-07、Dodaikun[frontPC]からのクロスセッション依頼）

Dodaikunからの原文（要約せず記録）:

> 依頼（実装可、ただし Beaver_beta・本番への書き込み実行はしない）:
> 1. A-B-12: 基準線記録のスクリプトを用意し、Beaver_beta に対して読み取り実行した出力例を返してください。対象 SQL は Beaver 側 R-0140(3)＝AccessTategu 設計書2 §5-2 の G-14（vouchers 6 本）＋設計書3 §5 の G-15〜G-18（customers: 総数／access_customer_no IS NOT NULL／CAST(code AS INTEGER)>=90001／同名 GROUP BY HAVING COUNT>1）。
> 2. A-B-10: T6 統合スクリプト（例: api/manual/r0143_merge_duplicate_customers.php または .sql）。入力は (keep_id, dup_id) の組リスト。処理: projects/vouchers/invoices/payments の customer_id を dup→keep に付け替え → dup 行を is_active=0, access_customer_no=NULL, code='DUP-'||code, memo に '[重複統合→keep]' 追記。物理削除しない。foreign_keys を考慮し 1 トランザクション。事前にバックアップ。テストは api/tests に追加。Beaver_beta で dry-run（件数表示のみ）まで。
> どちらも完了報告には実行コマンドとログのパス／テスト名だけを書いてください（合否はこちらで再確認します）。
>
> 補足: +10000 変換（r0140_5）は準備済み・未実行のままで正しいです。実行は A-X-01 の手順 4 で私から合図します。

### 未確定点 → 解消（2026-09-07、Dodaikunより回答受領）
G-14（vouchers 6項目）の具体的SQLをDodaikunから受領し、`docs/spec/R-0140_accesstategu_r086_integration.md`(3)へ反映済み（G-14-1〜G-14-6）。customers系4項目はDodaikun指定によりG-19〜G-22へ改番。旧G-14〜G-18（単一項目版）は廃案。

### 対応方針
- A-B-10: 仕様として十分具体的なため、`docs/spec/R-0140_accesstategu_r086_integration.md`に(6)として追記し、実装・テストを進める（Beaver_betaへの書き込みは行わず、dry-run件数表示のみ）
- A-B-12: G-14-1〜G-14-6（vouchers）＋G-19〜G-22（customers）を1回の実行でJST時刻つき1ファイルに出力するスクリプトとして実装中（`api/manual/r0143_baseline_snapshot.php`）

## 30. auth-hub連携: `auth_client.php`をv1.2.0に更新し、アプリ単位のアクセス許可判定（`app_id`指定）に対応する（2026-09-01、auth-hub側からの依頼）

auth-hub（社内共通認証基盤）にアプリ単位のアクセス許可管理機能が追加された（auth-hub R-0003、2026-09-01本番デプロイ済み。仕様: `C:\Fujiruki\Projects\auth-hub\docs\SPEC\01_認証仕様.md` §10）。

### 概要
社員（`is_employee=1`）以外のユーザーは、auth-hub側で個別に許可されたアプリしか使えなくなる。未許可時は「利用権限がありません」画面＋申請ボタンが出て、申請すると管理者に通知が届き承認できる。

### 対応内容
`auth_client.php`を正本（`C:\Fujiruki\Projects\auth-hub\auth_client.php`、現在v1.2.0。Beaverの現行は1.1.0）に更新し、`/auth/verify`呼び出しに`app_id`（`beaver`）を指定するよう変更する。指定しなければ現状通り（誰でもログインすれば使える）動作が維持される段階移行方針のため、着手時期は急がなくてよい。

### 前提（要注意）
auth-hub側で`apps`マスタへの登録・**既存ユーザー全員への利用許可の一括付与がまだ行われていない**（DotLog・KintaiTSUMUGIのみ2026-09-01完了済み）。`app_id`対応を有効化する前に、auth-hub側（`C:\Fujiruki\Projects\auth-hub`）へ依頼し、同様の一括許可処理をしてもらうこと（さもないと既存ユーザーが締め出される）。

### 優先順位
未整理。仕様化はこれから。

---

## 23. R-0132: PWAインストール時のアイコンが適切に設定されていない（2026-08-31発覚、優先度中）

/readyoubouで本番フィードバックid=36を確認（iPhone Safari、原文一部判読不能箇所あり）:

> 「ダッシュボードをPWAインストールした時にアイコンがダサくなってる。ファビコン設定がされてないからかな?」

### 調査結果
`frontend/index.html`には`<link rel="icon" type="image/svg+xml" href="/favicon.svg">`のみで、`apple-touch-icon`（iOSホーム画面用PNG）も`manifest.json`（Android/デスクトップPWA用アイコン定義）も存在しない。iOSでホーム画面に追加すると、専用アイコンが無いためOSが生成する簡易サムネイルが使われ、見た目が悪くなっていると推測される。

### 対応方針（未着手、次回セッション候補）
- 各サイズのPNGアイコン（180x180のapple-touch-icon、192x192/512x512等）を用意し`index.html`に`<link rel="apple-touch-icon">`を追加
- `manifest.json`を新設しicons配列を定義、`index.html`に`<link rel="manifest">`を追加
- 素材（ロゴ画像）が無ければ藤田晴樹さんに確認が必要

### 優先度
中（機能に支障はなく見た目の問題）。

---

## -10. 本番の集計区分同期がcatalog-system認証ゲートで機能しない（バックログ、2026-08-27発覚）

R-0119の本番実測で判明: Beaverの `POST /aggregation-categories/sync` は本番サーバーからcatalog-system API（`https://door-fujita.com/contents/catalog-system/api/aggregation-categories`）を呼ぶと401（auth-hub認証ゲート）で失敗する。R-0119ではmigration 027によるシードで回避した（区分変更は稀のため実害小）。恒久対応にはcatalog-system側にサーバー間トークン認証の例外（BANTO_API_TOKEN/YOUKAN_API_TOKENと同パターン）を追加し、Beaver側の同期リクエストにトークンを付与する改修が必要（catalog-systemリポジトリをまたぐ）。集計区分を変更する運用が発生したら着手を検討。

## -9. AccessTategu連携用の同期APIに認証を追加してほしい（バックログ、2026-08-17発覚）

R-0109（Beaverへのauth-hub組み込み・ログイン基盤導入）の仕様検討中に判明: `/projects/sync`・`/vouchers/sync`・`/aggregation-categories/sync`・`/vouchers/{id}/access-link` 等のAccessTategu連携用エンドポイントは、トークン等の認証機構が一切なく、本番では `.htaccess` Basic認証（R-0099、URLを知っていれば誰でも通る共有パスワード）でのみ保護されている。R-0109ではこれらのエンドポイントを画面系ログイン必須化の対象外としたため（人間のログインではなくAccess(VBA)からのシステム間連携のため）、この無防備状態は今回では解消されない。

藤田晴樹さんの指示（2026-08-17）: 別要望として起票し、後日対応する。

### 検討が必要な点
- 認証方式（DotLogの「番頭AI用APIキー」のような専用APIキー認証が有力候補）
- AccessTategu側（VBA実装）への影響有無・改修要否

### 優先順位
未整理。R-0109完了後に着手を検討。

---

## 0. R-0096: システム全体の「戻る」ボタン・戻る機能対応（着手保留、2026-08-06以降）

R-0080フィードバック（id=11、2026-08-05 07:32、藤田晴樹より）原文:

> これはとても重大な慎重に作るべき問題なんだけど、このシステム全体で戻るボタン、戻る機能が使えるようになってほしい、ただしこれはいろんな状況、いろんな画面でどんな仕様にするかをよく考える必要があるのでfableなどの力も借りなくてはいけないね、この戻るに関する機能だけは８月６日以降に作りましょう。

### 着手条件
**2026-08-06以降**に着手する（藤田晴樹さんの明示指定）。それより前に仕様化・実装を始めないこと。

### 藤田晴樹さんの回答（2026-08-06、Fable設計提案書への確認事項より）
- 「← 戻る」ボタンの意味: 履歴優先＋親階層フォールバック（`useSmartBack`案）
- 伝票保存後の遷移先: 来た画面へ戻る
- モバイル/タブレット利用: あり（モーダルの履歴連動対応の優先度が上がる）
- 明細行の即時保存仕様: 現状のまま受け入れ、画面上に明示する方針（「明細は自動保存」等の表示を追加）

### 追加相談（2026-08-06、藤田晴樹さんより）
藤田建具店の社内システム全体（勤怠管理・Beaver・Wiki・**Youkan・catalog-systemも含む**）を見据えた認証基盤の相談が追加された。要件: 社員個別アカウント、一度ログインしたデバイスは持続ログイン（低フリクション重視）、メールでのパスワードリセットURL送信、社員の区別は必要だがログインのハードルは下げたい。**Beaver側では「誰が登録したか」を記録できるようにしたい（登録者を識別するアカウントが必要）**。Beaverリポジトリ単体では扱いきれない範囲（複数アプリ間の共通認証基盤）のため、Fableに設計相談中（回答待ち）。

### 戻る機能の解釈確認（2026-08-06）
Fableへの相談は「ブラウザバック」機能として進めてよい（そのまま継続）。**これとは別に**、データ操作の「元に戻す（Ctrl+Z的なUndo/Redo）」機能も欲しいとのこと。藤田晴樹さんいわく、こちらも「重大で慎重に進めるべき要望」であり、戻るボタンとは切り分けて、別途Fableに設計相談する（→ R-0098として起票）。

### 着手時にやること
- 各画面（案件一覧・詳細、伝票編集、得意先一覧・詳細等）でのブラウザ戻る・アプリ内「戻る」ボタンの期待動作を整理する（未保存の変更がある場合の確認、一覧の検索・ページ・ソート状態の復元＝R-0091のURL状態保持パターンが参考になる、モーダル内での戻る等、状況ごとに仕様が異なりうる）
- 設計が複雑なため、Fable（`claude-fable-5`）等、複数のAIの視点を借りて検討する（藤田晴樹さんの指定）
- 仕様が固まったら、通常のSdDDフロー（R-IDを維持したまま`requests_log.md`・`docs/spec/`・`task.md`へ展開）で進める

---


## 1. ~~R-025: BA連携 Phase 1（案件番号橋渡し、2026-06-05 確定）~~ ✅ 完了（2026-08-11判明・実装は2026-06-06頃）

**2026-08-11追記**: 以下の記述は2026-06-05時点の未着手メモのまま放置されていたが、指揮役が調査した結果、要望登録直後（コミット`c3cef43`→`2291a80`→`eaf0587`）にStep A〜Eすべて実装・レビュー修正まで完了し、本番適用済みであることを確認した。`GET /projects/sync`（`api/routes/projects.php:65-136`、updated_after/include_cancelled/limit/cursor対応、完全一致ルーティングガードあり）、push back受信一式（`api/routes/sync_helpers.php`）、マイグレーション3本（009/010/011、access_customer_no・access_voucher_id・UNIQUE制約）が揃っている。ドキュメントの放置による誤解を避けるため、この節は記録として残すが対応不要。

藤田晴樹確定。AccessTategu との双方向同期基盤を構築する。**旧 Phase 7（AccessTategu 連携）はこの R-025 に統合・拡張。**

### 確定方針
| 項目 | 決定 |
|:--|:--|
| 案件マスタ権威 | Beaver 一本（projects テーブル） |
| Access キャッシュ更新 | Access 起動時に自動 + 手動「Beaver 案件取込」ボタン |
| Access 側 新規見積作成 | 残す（→ push back 必要） |
| 着手範囲 | Step A〜E 全部 |

### Beaver 側のスコープ
- **Step A**: `GET /projects/sync` API 追加（Access 用軽量フォーマット、案件番号 / 案件名 / 得意先番号 / ステータス / 更新日時）
- **Step E**: Access→Beaver push back 受信エンドポイント（伝票・発送済ステータス等の同期）

### AccessTategu 側のスコープ
- Step B: `tbl案件_cache` 追加 + 「Beaver 案件取込」ボタン + 起動時自動同期
- Step C: `tbl見積` / `tbl売上` / `tbl請求書` に `案件番号` 列追加（migration 010-012）
- Step D: 見積入力フォームに案件番号コンボボックス追加

### 旧 Phase 7（統合済み、参考）
- `api/migrations/009_customer_access_no.sql` — customers に access_customer_no 列追加（R-025 で再評価）
- `api/routes/customers.php` — 更新フィールド配列に追加
- `frontend/src/types/customer.ts` + `pages/CustomerDetail.tsx` — 入力 UI 追加

詳細仕様: `Projects/AccessTategu/docs/R-025_BA連携_詳細設計.md`（grill 反映済み）。

### 着手タイミング
AccessTategu の R-022（請求書発送済管理）完了済み（2026-06-06、HEAD: fe479fe）。R-025 設計確定（grill 反映済み）→ Step A から実装開始可能。

---

## 2. ~~R-027: Beaver の定時バックアップ機能~~ ✅ 完了（2026-06-07）

ConoHa の本番 Beaver に `backup.sh` 設置 + crontab 毎日 03:00 登録済み:
- スクリプト: `public_html/door-fujita.com/contents/Beaver/backup.sh`
- 出力先: `api/backups/database_yyyymmdd_HHMM.sqlite`
- 30 日ローテーション（find -mtime +30 -delete）
- ログ: `api/backup.log`
- crontab: `0 3 * * * /home/c6924945/.../Beaver/backup.sh`

異常検出（前日比サイズ激減等）は未実装。必要なら R-027b として別途。

---

## 3. ~~R-034: Beaver validation 強化（2026-06-06 R-025 review で発覚）~~ ✅ 完了（2026-08-11判明・実装はコミット`a70a4ba`）

**2026-08-11追記**: 指揮役が調査した結果、(a)〜(d) すべて実装済みと確認。(a) `sync_helpers.php:222-225`でproject_id!==null かつ customerId===null なら400（過去伝票モードのみNULL許容）。(b) `projects.php:60`で`isset($segments[2])`なら404の完全一致ガード実装済み。(c) `insertSyncedLines`（`sync_helpers.php:440-529`）でline_type/tax_category/quantity/line_totalを厳格検証、不正時422。(d) `syncVoucherUpdate`が`replaceSyncedLinesFromPayload`を呼びUPDATE経路でも明細更新に対応（`lines_mode=replace`時）。対応不要、記録として残す。

R-025 Step E-Beaver の review で発覚。デプロイ前に対応した HIGH 修正（H1/H2/H3/M2）と別に、運用してから対応すべき MEDIUM 級の改善。

### 内容
- (a) **POST /vouchers/sync で customer_access_no 空が silent 許容される問題**: 過去伝票（project_id=NULL）モードでは `$accessCustomerNo === ''` 分岐により validation がスキップ → customer_id=NULL の伝票が無音で作成される。仕様確認の上、必須化するか過去伝票モード時のみ NULL 許容とする分岐を明示。
- (b) **GET /projects/sync ルーティング順の脆さ**: 現状の `isset($segments[1]) && $segments[1] === 'sync'` 判定は `/projects/sync/anything` を全件返却で誤通過させる可能性。`!isset($segments[2])` の完全一致チェックを追加。
- (c) **voucher_lines の validation 不足**: `insertSyncedLines` で `line_type` / `tax_category` / `quantity` / `line_total` の値検証なし。`line_type ∈ {normal, discount, ...}` / `tax_category ∈ {課税, 非課税, ...}` のホワイトリスト導入、`quantity >= 0` チェック。
- (d) **UPDATE 経路で lines を触らない仕様**: コメントには「INSERT 時のみ取り込み」とあるが、Access 側で明細が後で変更された場合に Beaver に反映されない盲点。仕様判断: 明示コメント化 or UPDATE 経路で `DELETE → INSERT` のフル置換に変更するかを決定。

### 優先順位
R-025 デプロイ後に着手。実害は限定的（不正データ流入リスクが小さい運用環境）。

---

## 4. ~~R-035: Beaver /projects/sync pagination + access_voucher_no 重複対策（2026-06-06 R-025 review で発覚）~~ ✅ 完了（2026-08-11判明・実装はコミット`a70a4ba`）

**2026-08-11追記**: 指揮役が調査した結果、(a)(b)とも実装済みと確認。(a) `GET /projects/sync`はupdated_after/limit/cursor（since_id方式）に対応済み。(b) `syncVoucherUpdate`/`syncVoucherShipped`とも複数ヒット時は`error_log`警告＋`LIMIT 1`で先頭のみ更新する防御実装済み、加えてmigration 011で`access_voucher_id`のUNIQUE制約による根本対策も併存。対応不要、記録として残す。

R-025 review の MEDIUM/LOW 級指摘。

### 内容
- (a) **GET /projects/sync が pagination/limit を持たない**: `updated_after` なし呼び出しで全件返却 → 案件数が増えると応答サイズが線形に膨れる。デフォルト `limit=1000` + `since_id` ベース cursor pagination を導入、または `updated_after` 必須化。
- (b) **syncVoucherUpdate / syncVoucherShipped が access_voucher_no 重複時に「最初の 1 件」を silent 更新**: `SELECT id FROM vouchers WHERE access_voucher_no = ?` に LIMIT なし → 先頭 1 件のみ更新で残りは取り残される。R-029 の access_voucher_id UNIQUE 制約で根本対処されるが、LIMIT 1 明示 + 複数ヒット警告ログ追加で防御的に。

### 優先順位
R-025 完了後・実運用で問題顕在化したら着手。

---

## 5. ~~R-036: frontend ビルドエラー（型エラー）~~ ✅ 解決済み（2026-06-24）

`AppSettings.tsx:156` は `as unknown as Record<string, string>` キャストで解消済み。`tsc -b` exit=0、R-065/A修正のデプロイ時に `npm run build`（tsc込み）成功で確認。

R-025 デプロイ作業中に発覚（2026-06-07）。`npm run build` (`tsc -b && vite build`) で型エラー:

```
src/pages/AppSettings.tsx(156,42): error TS2345:
  Argument of type 'ColumnMapping' is not assignable to parameter of type 'Record<string, string>'.
  Index signature for type 'string' is missing in type 'ColumnMapping'.
```

R-025 とは無関係（既存コードの型整合性問題）。frontend ビルドが通らないため、本番には backend (api/) のみデプロイした状態。frontend の R-025 対応 UI（案件詳細などに `access_customer_no` 連携表示等）は未デプロイ。

### 対応
- `src/pages/AppSettings.tsx:156` の `ColumnMapping` 型に index signature を追加するか、呼び出し側を `Record<string, string>` に明示変換
- ビルド成功確認後、frontend をデプロイ（Youkan の deploy パターン参照）

### 優先順位
中。frontend 機能の本番反映には必須だが、AccessTategu↔Beaver の R-025 同期機能には影響しない。

---

## 6. R-038: 得意先マスタの双方向同期（2026-06-07 R-025 デプロイ後の追加要望）

R-025 では案件マスタのみ同期、得意先（customers ↔ tbl得意先M）は未同期。R-025 と同じパターンで実装する。

### Beaver 側のスコープ
- `GET /customers/sync` API 追加（R-025 Step A の `/projects/sync` 模倣）
  - クエリ: `updated_after` / `include_inactive`
  - レスポンス: 得意先 ID, 名前, アドレス, アクセス番号, 更新日時 等
- 必要なら `POST /customers/{id}/sync` でPush back 受信（双方向の場合）

### 設計判断要点（grill 必要）
- (a) tbl得意先M（既存 AccessTategu 権威）と tbl得意先_cache（Beaver ミラー）を分離
- (b) Beaver 権威に統一して tbl得意先M を tbl得意先_cache 化（影響範囲大）
- (c) 双方向同期、両側で編集可能

### 着手タイミング
R-037（案件管理 UI）と並行 or その後。

---

## 7. TateguDesignStudioとの連携

TateguDesignStudio（建具設計・積算ツール）で設計・積算した建具データを、Beaverの伝票明細に取り込めるようにする。

### 想定フロー
1. TDSで建具を設計→積算完了
2. Beaverの伝票編集画面で「TDSから取込」ボタン
3. TDSのAPIから建具データ（名前、原価内訳、数量）を取得
4. 伝票明細行に自動挿入（原価スナップショットとして）

### 優先順位
Phase 7（Access連携）完了後に着手。

## 8. ~~割引明細の消費税ベース不一致（B）~~ ✅ 解決済み（2026-06-24）

伝票合計計算で「割引を税の課税ベースから引くか」がフロントとバックエンドで食い違っている。

### 現状（2026-06-24 調査・実コード/実データ確認済み）
- フロント `frontend/src/lib/voucherCalc.ts`: `課税ベース = 課税合計 − 割引合計`（割引後に課税）
- バックエンド `api/routes/vouchers.php` `recalcVoucher`: 割引を引かず gross の課税合計に課税（`total` でのみ割引を減算）
- 例（税抜・課税10万/割引1万）: フロント 税額9,000/合計99,000 vs バックエンド 税額10,000/合計100,000（1,000円差）
- 注: A修正（内税丸め一本化, 2026-06-24）でinclusive分岐はFE/BEとも「割引後に課税」へ揃えた。**残るBの不一致はexclusive分岐のみ**。

### 現状の実害
- Access同期伝票（本番5,777件中の割引付き887件）は `tax_amount=0` で `recalcVoucher` を通っておらず、Access値を保持＝**現状は無傷**。
- Beaver内で新規作成・編集した伝票でのみ表面化する潜在バグ。

### 確定した正本（Access実コードで確認）→ 一本化済み
- **税額は割引前の課税小計に課税、値引は合計でのみ減算**（外税: `floor(課税小計×税率)`／内税: `floor(課税小計税込×税率/(1+税率))`）。出典 `AccessTategu/src/forms/fsub売上.frm:2648`・`frm売上.frm:1600`。詳細 `AccessTategu/docs/wiki/knowledge/tax_calculation.md`。
- ⇒ **BEが正・FEが誤**だった。FE `voucherCalc.ts`(exclusive/inclusive)と BE `vouchers.php`(inclusive; A修正で割引後にしていた分を是正)を正本へ一本化。exclusive BE は元から正。
- 同期伝票（割引付き887件）は `recalcVoucher` 未通過(tax_amount=0)で無傷＝データ移行不要。Beaver内で作成・編集した伝票でのみ影響。
- テスト: `frontend/.../voucherCalc.test.ts`（割引 exclusive/inclusive）、`api/tests/test_recalc_inclusive.php`（T-05改・T-07追加）。

### 関連
- R-065 と同時調査した内税丸めバグ（A: 910 vs 909）は別途修正。本件はその派生。

## 9. ~~test_sync.php が全ケース500（既存破損）~~ ✅ 解決済み（2026-06-24）

`api/tests/test_sync.php` が全アサーション500（`vouchers.consumption_tax_type` 等 NOT NULL列への明示NULLバインド）。

- 修正: `sync_helpers.php` で変数はnull維持、INSERTのVALUES句で `COALESCE(:x, 既定値)`、upsertのDO UPDATEは生バインド `:x` 参照（`COALESCE(:x, x)`）に分離。再同期で未送信列が既存値を保持するよう設計。
- 初回修正で「再同期時に既存値をDEFAULTで上書き」する**本番データ破壊の回帰**を一度混入→指揮役が実コード精査で検出→回帰テスト2件(R-066-保持)を赤→緑で固定。test_sync 28/0。

---

## 13. ~~R-027b: 本番の日次バックアップが停止している疑い~~ ✅ 解決済み（2026-07-14）

2026-07-06 のデプロイ列車（migration 018/019/020 本番適用）作業中に発覚。SSH遮断中のためFTPS＋一回限りPHPスクリプト（`shell_exec`経由でcrontab確認・修正）で調査・復旧した。

### 症状（確定）
- `backup.log` の最終行は2026-06-09 03:00（それ以降のcron実行は無音失敗）
- crontab自体は生きていた（`0 3 * * * .../Beaver/backup.sh`）。原因はスクリプト側の消失

### 根本原因
`backup.sh` は Beaver ルート直下に置かれ、かつ **git管理外**（R-027完了時にSSHで直接設置しただけ）だった。`upload.ps1` のデプロイコマンド

```
find . -maxdepth 1 ! -name 'api' ! -name '.' ! -name '$archiveName' ! -name '*.sqlite' -exec rm -rf {} +
```

はルート直下で `api/` と `*.sqlite` 以外を全削除する仕様のため、2026-06-09以降の最初のデプロイ実行時点で `backup.sh` が消えていた（api/以下ではないため保護対象外）。

### 復旧内容
1. `api/backup.sh` として**gitで正式に追跡**する形で再構築（`api/`配下はデプロイ時に保護されるため今後は消えない）
2. crontabを `0 3 * * * /bin/bash .../Beaver/api/backup.sh` に更新（`/bin/bash`経由の起動にすることで、`upload.ps1`のchmodステップが全ファイルを644に戻しても実行できるようにした。実行ビット依存を排除）
3. 30日ローテーションの対象を自動生成ファイル名（`database_YYYYMMDD_HHMM.sqlite`）のみに限定し、手動退避ファイル（`_pre_xxx`等のサフィックス付き）を誤削除しないよう安全化
4. 本番でテスト実行し、`backup.log`への追記・新規バックアップファイル生成・古い自動生成分3件のみのローテーション削除（手動退避分は保持）を確認済み

### 今後の運用
- `api/backup.sh` はリポジトリのソースが正本。変更時は通常デプロイで反映される
- 同種の「ルート直下・git管理外ファイルが次デプロイで消える」問題は他にも起こりうるため、本番専用ファイルを置く場合は必ず `api/` 配下＋git管理下にすること

---

## 14. R-072-B: projectsテーブルのdev/prodスキーマ乖離の棚卸し（Beaver側）

2026-07-06 R-071 対応・本番migration適用作業中に発覚。

### 症状
- R-071修正で追加した migration 020（`order_date`/`owner_name`/`general_contractor_name`/`site_contact` の4カラム追加）を本番に適用しようとしたところ、**本番の `projects` テーブルには既にこの4カラムが存在していた**（手動追加の痕跡と推定）
- 一方 dev側の `api/schema.sql` と `api/migrations/*.sql`（020適用前）にはこれらのカラムが一切記録されていなかった
- つまり本番と開発でスキーマが逆方向に乖離していた（本番が先行し、devのmigration履歴に記録が無い状態）。migration 020 は dev にのみ適用し、本番は元々充足済みのため未適用（今回は実害なし）

### 優先度
【中】。今回は実害なく発覚したが、同種の記録漏れが他テーブルにもある可能性があり、本番デプロイ作業のたびに同様の食い違いに遭遇するリスクがある。

### 対処方針（案）
- 本番 `projects` テーブルの `PRAGMA table_info` と dev の `schema.sql`＋全migration適用後のスキーマを突合し、他に記録漏れの列・テーブルがないか棚卸しする
- 本番手動変更の経緯（いつ・誰が・なぜ追加したか）が追跡できるドキュメントが無いため、可能な範囲で経緯を確認し、今後同様の手動変更をする際は migration ファイルとして必ず記録する運用を徹底する

---

## 15. R-076: 「Beaverと同期」統合のBeaver側対応（2026-07-07 計画承認済み）

Access側の統合同期ボタンに対応するBeaver側タスク群（詳細: AccessTategu側R-076と共通計画）:
- B1-1: /vouchers/sync の updated_at/last_synced_at をJST正規化（SQLiteのCURRENT_TIMESTAMPがUTCであることを本番実測で確認済み）
- B1-2: syncVoucherUpsert 成功時に vouchers.last_synced_at をセット（エコー競合の抑止）
- B2-1: /vouchers/sync 応答へヘッダ項目追加（trade_type/description/print_*等＋customer_access_no）
- B2-2: lines_mode='replace'（競合解消の明示採用時の明細フル置換）
- B2-3: PATCH /vouchers/{id}/access-link（Beaver発伝票のaccess_voucher_id書き戻し）
- B3-1/B3-2: GET /customers/sync 新設（完全一致ルーティングガード必須）＋customers.last_synced_at
- B4-1: mergeSyncedLines（access_line_id行単位マージ・edited_in_beaver保護、R-066(c) Phase2本丸）

## 16. R-078: 建具台帳の型定義とDBカラムの不整合（2026-07-08 DataTable移行中に発見）

`TateguItem`型の `item_code`/`spec`/`unit` フィールドが実DBと不一致（`PRAGMA table_info(tategu_items)` で確認: 実在は `code` のみ、`spec`/`unit` 列は存在しない）。建具台帳一覧の「品名コード・仕様・単位」表示は元から空欄になっているはず。型定義の修正 or カラム追加の仕様判断が必要。DataTable移行ではソート対象から除外済み。

---

## 19. ~~R-0093: PHPテスト用一時SQLiteファイルの競合対策~~ ✅ 解決済み（2026-09-08、Codexへ委譲・実装）

2026-08-05、複数のCodex実装・指揮役の検証コマンドを並行実行した際に、`test_sync.php`/`test_list_sort.php`等がランダムに失敗する事象を確認（`api/tests/test_projects.sqlite`等、テストファイルごとに固定名の一時SQLiteを使っているため、同時実行時に競合する）。単独実行時は問題なし。

### 対応（2026-09-08）
`api/tests/`配下をgrepした結果、固定名のまま残っていたのは`test_sync.php`内の`test_migration_012_preserves_sales_category_id`テストケース（他は既に`getmypid()`でユニーク化済み）のみだった。`test_migration_012.sqlite` → `test_migration_012_' . getmypid() . '.sqlite`に変更（commit `6d93a3f`）。`test_sync.php`単独実行56/0 PASS、`test_sync.php`と`test_list_sort.php`の異なるテスト同士の並行実行も両方PASSを確認。

### 派生の発見（別件・未対応）
同一テストファイル（`test_sync.php`）を2本同時起動すると、固定ポート番号と`_server_bootstrap.php`（一時ファイル名固定）の競合で失敗することが分かった。これはSQLiteファイル名とは別の資源競合で、通常の開発フロー（異なるテストの並行実行、または同一テストの連続実行）では発生しないため、今回のR-0093の対応範囲外として様子見。再発したら別要望として起票する。

## 18. R-0084: 検索の複数プロパティ対応 Phase2（バックログ、未着手）

R-0083（得意先 + ComboSelect共通化）のPhase1完了後の横展開。案件一覧・建具台帳一覧・伝票一覧・請求書一覧など他の検索画面にも同じ複数プロパティ検索パターンを展開する。検索対象プロパティをUIから選べるようにする案も含め、着手時に仕様化する。詳細: `docs/spec/R-0083_search_multi_property.md` の「Phase 2」節。

---

## 17. R-079: 見積から売上を「引用して売上」で作成した際、同じ案件に属すること（2026-07-14 藤田晴樹確認要望）

「引用して売上」（R-065）で作成した売上伝票は、元の見積伝票と同じ案件に属しているべき、という仕様要望。

### 調査結果: ✅ 現状すでに満たされている（コード確認済み、2026-07-14）

- Beaver側: `api/routes/vouchers.php` の `POST /vouchers/{id}/convert-to-sales`（588〜629行目付近）で、新規売上伝票の`project_id`は元見積の`project_id`（`$orig['project_id']`）をそのまま引き継いでコピーしている
- Access同期側: `Df_Beaver連携.bas`（1356行目）で、Beaver発の新規伝票取込時（R-076 A2-3）も`beaverJson`の`project_id`を`案件番号`列にマッピングしており、同期経路でも欠落しない
- 見積→売上は完全ディープコピー方式（一度きりのコピーで、以降は独立管理）のため、変換後に元見積の案件を変更しても売上側は追従しない。これは仕様通り（伝票ごとに独立した記録を残す設計）

### 今後の扱い
新規のバグ・要望ではなく、既存仕様として保証されている点の確認記録。将来この経路を変更する際の回帰防止の参考にする。
