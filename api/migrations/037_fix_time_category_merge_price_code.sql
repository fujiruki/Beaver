-- R-0145 (B): R-0119のmigration 027再シードでmerge_into_price_codeが引き継がれず
-- NULLに戻ってしまっていた問題の修正。工場時間・現場時間の労務費を本体(MAIN)の
-- 売値計算にマージする設定を復元する（3.7.17互換の単純UPDATEのみ）。
UPDATE aggregation_category_master
SET merge_into_price_code = 'MAIN'
WHERE code IN ('FACTORY_TIME', 'SITE_TIME')
  AND merge_into_price_code IS NULL;
