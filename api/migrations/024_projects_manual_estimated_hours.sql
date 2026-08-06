-- R-0097: 案件に工数目安（手動入力）列を追加
ALTER TABLE projects ADD COLUMN manual_estimated_hours REAL;
