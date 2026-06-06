-- R-025 review HIGH 修正: access_voucher_id に UNIQUE 制約を追加
-- 同じ access_voucher_id の伝票が二重 INSERT される race condition を DB レベルで遮断する。
-- SQLite では複数行の NULL は UNIQUE 違反にならないため、
-- Beaver で直接作成された手入力伝票 (access_voucher_id IS NULL) は影響を受けない。
-- 注: ON CONFLICT(col) は部分 UNIQUE インデックス (WHERE 句付き) にマッチしないため、
-- WHERE 句なしで作成する。
DROP INDEX IF EXISTS idx_vouchers_access_voucher_id;
CREATE UNIQUE INDEX IF NOT EXISTS uq_vouchers_access_voucher_id
  ON vouchers(access_voucher_id);
