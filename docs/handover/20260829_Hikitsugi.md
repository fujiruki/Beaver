## 直近の作業（2026-08-29）: /readyoubouバッチ R-0122〜R-0128（本番フィードバック新着7件）実装・デプロイ済み

### 概要
`GET /admin/feedback`でid=28〜34（7件）を取得。id=3〜27は`requests_log.md`で対応済み確認済み。うち6件（R-0122〜R-0127）を仕様化・Codex（TDD）へ実装委譲・本番デプロイ済み。R-0128（原因不明バグ）は保留。

### 実装した6件（いずれも実装・本番デプロイ済み、**実機検証は藤田晴樹さん待ち**）
- **R-0122**: 段取りボードのガントバー/開始日未設定リストの案件名ダブルクリックで、主要フィールドを編集できる軽量モーダル（`ProjectQuickEditModal`）を追加
- **R-0123**: 案件から新規伝票作成時にproject_id/customer_idが引き継がれない不具合を修正（**本番で再現を確認**）
- **R-0124**: 「原価から売値を設定」ボタンの算出値を100円単位で四捨五入
- **R-0125**: 労務単価のデフォルト値を設定画面で管理し新規伝票の明細行へ自動反映
- **R-0126**: 売上に引用済みの見積を編集不可に（フロント表示制御＋バックエンドAPI両方にガード）
- **R-0127**: 案件編集画面の工数目安(h)入力欄の隣に日数換算ラベルを追加

### 重要な技術的発見（次回同種の不具合に遭遇したら参照）
R-0122・R-0123はいずれも**同一の根本原因**だった: `<select {...register('xxx_id', {valueAsNumber:true})}>`へ`reset()`や`defaultValues`で**数値**をそのまま渡すと、テスト環境`happy-dom`（`frontend/vite.config.ts`で`environment: 'happy-dom'`指定）の`HTMLSelectElement.value`セッターが数値→文字列の暗黙変換をせず、一致する`<option>`を発見できない（`sel.value = 1`は反映されないが`sel.value = '1'`なら反映される）。加えて`projects`/`customers`等の非同期取得optionが揃う前に`reset()`が走ると値が失われる。**対処法**: 該当selectをフォーム内部では文字列として扱う設計に統一する（型を`string`にし`valueAsNumber`を外す、reset時に`String(value)`、送信時に`Number(data.xxx)`変換）。fixerが`ProjectQuickEditModal.tsx`・`VoucherEdit.tsx`・`VoucherHeader.tsx`で確認・修正済み。

### 実装体制・検証
- 仕様: `docs/spec/R-0122_R-0127_project_dandori_improvements.md`、`docs/spec/R-0123_R-0124_R-0125_R-0126_voucher_edit_improvements.md`
- Codex（`codex:codex-rescue`、worktree隔離で並行実行）にTDD実装委譲 → テスト失敗2件をfixerが根本原因調査・修正（上記happy-dom問題）
- 指揮役が両worktreeの差分をメインリポジトリへ`git apply`で統合し、vitest(61ファイル334件全PASS)・`npm run build`・`bash .claude/regression-suite.sh`（exit 0）を再実行して裏取り
- コミット: `2d99792`（R-0122/R-0127）、`a16de93`（R-0123〜R-0126）→ push済み
- 本番デプロイ済み（事前バックアップ`database_20260829_2321_pre_r0122_r0128.sqlite`）、`/api/health`・アプリ200確認済み
- Wuunuスニペット（`frontend/index.html`未コミットのローカル変更）はデプロイ時に一時stash→ビルド→復元済み（本番には持ち込んでいない）

### R-0128（保留、次回セッションで参照）
本番フィードバックid=34「たまに画面を開いた時にこんな画面になることがある」（添付画像は`project_statuses`マスタAPIの生JSON配列がiPhone Safariに全面表示されたスクリーンショット）。`.htaccess`のSPAフォールバック・ルーティング・fetch呼び出し箇所を調査したがコード側に原因は見当たらなかった。藤田晴樹さんへ発生経路（ホーム画面ショートカット/ブックマーク/タブ復元/直接URL入力）を確認したが「わからない・覚えていない」。次回発生時にURLバーの表示内容を確認してもらうことになっている。

### 次にやること
1. **藤田晴樹さんの本番実機確認**: 6件（R-0122〜R-0127）それぞれの動作確認 → OKなら台帳を「完了」へ更新
2. R-0128（生JSON表示バグ）: 再発時の情報待ち、追加情報が得られたら再調査
3. worktree未削除（`.claude/worktrees/agent-ad15eead68ebef4b4`、`agent-abe7bcf2e660d1f63`）。破壊的操作としてブロックされたため未クリーンアップ、次回セッションで`git worktree remove`を検討

---

