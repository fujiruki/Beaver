# 要望・リクエスト

## 1. Phase 7: AccessTategu連携

Beaver側の実装（設計完了・未実装）。詳細は `spec/02_機能仕様.md` のAccessTategu連携の節と `archive/UserVoice/accessへ見積伝票挿入機能.md` を参照。

### Beaver側の変更（3ファイル）
1. `api/migrations/009_customer_access_no.sql` — customers に access_customer_no 列追加
2. `api/routes/customers.php` — 更新フィールド配列に追加
3. `frontend/src/types/customer.ts` + `pages/CustomerDetail.tsx` — 入力UI追加

---

## 2. TateguDesignStudioとの連携

TateguDesignStudio（建具設計・積算ツール）で設計・積算した建具データを、Beaverの伝票明細に取り込めるようにする。

### 想定フロー
1. TDSで建具を設計→積算完了
2. Beaverの伝票編集画面で「TDSから取込」ボタン
3. TDSのAPIから建具データ（名前、原価内訳、数量）を取得
4. 伝票明細行に自動挿入（原価スナップショットとして）

### 優先順位
Phase 7（Access連携）完了後に着手。
