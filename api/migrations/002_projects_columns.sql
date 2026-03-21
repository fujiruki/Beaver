ALTER TABLE projects ADD COLUMN project_code TEXT;
ALTER TABLE projects ADD COLUMN address TEXT;
ALTER TABLE projects ADD COLUMN memo TEXT;
ALTER TABLE projects ADD COLUMN delivery_date DATE;
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_code ON projects(project_code);
INSERT OR IGNORE INTO sequences (key, last_no) VALUES ('project', 0);
