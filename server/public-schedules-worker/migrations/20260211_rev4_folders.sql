CREATE TABLE IF NOT EXISTS folders (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  parent_id TEXT,
  depth INTEGER NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(parent_id, name)
);

CREATE INDEX IF NOT EXISTS folders_parent_id ON folders(parent_id);
CREATE INDEX IF NOT EXISTS folders_sort_order ON folders(sort_order);

ALTER TABLE schedules ADD COLUMN folder_id TEXT;

CREATE INDEX IF NOT EXISTS schedules_folder_id ON schedules(folder_id);
