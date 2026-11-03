-- R-0241: 帳票に出ない社内の記録（Access の F-25 と同期）
ALTER TABLE vouchers ADD COLUMN hidden_note TEXT;
