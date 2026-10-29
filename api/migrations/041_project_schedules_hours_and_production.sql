-- R-0222: 予定の end_date を NULL 可にし、見込み時間 hours を足す。案件の開始日を製作の予定へ移す
CREATE TABLE project_schedules_new (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    kind        TEXT NOT NULL,
    start_date  DATE,
    end_date    DATE,
    hours       REAL,
    memo        TEXT NOT NULL DEFAULT '',
    done        INTEGER NOT NULL DEFAULT 0,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    CHECK (start_date IS NULL OR end_date IS NULL OR start_date <= end_date),
    CHECK (hours IS NULL OR hours >= 0),
    CHECK (start_date IS NOT NULL OR end_date IS NOT NULL OR hours IS NOT NULL)
);

INSERT INTO project_schedules_new (id, project_id, kind, start_date, end_date, memo, done, created_at, updated_at)
SELECT id, project_id, kind, start_date, end_date, memo, done, created_at, updated_at FROM project_schedules;

DROP TABLE project_schedules;

ALTER TABLE project_schedules_new RENAME TO project_schedules;

CREATE INDEX IF NOT EXISTS idx_project_schedules_project ON project_schedules(project_id);

INSERT INTO project_schedules (project_id, kind, start_date)
SELECT p.id, '製作', p.start_date FROM projects p
WHERE p.start_date IS NOT NULL AND p.start_date <> ''
  AND NOT EXISTS (SELECT 1 FROM project_schedules s WHERE s.project_id = p.id AND s.kind = '製作');
