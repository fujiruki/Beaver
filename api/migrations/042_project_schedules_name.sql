-- R-0224: 予定の種類が「その他」のときに入れる工程名
ALTER TABLE project_schedules ADD COLUMN name TEXT NOT NULL DEFAULT '';
