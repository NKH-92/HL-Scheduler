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

CREATE TABLE IF NOT EXISTS schedules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  data TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planning',
  tasks_count INTEGER NOT NULL DEFAULT 0,
  vacations_count INTEGER NOT NULL DEFAULT 0,
  folder_id TEXT,
  holding_reason TEXT,
  next_action TEXT,
  recent_activity_json TEXT,
  overview_json TEXT,
  created_by_email TEXT,
  updated_by_email TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS schedules_created_at ON schedules(created_at DESC);
CREATE INDEX IF NOT EXISTS schedules_name ON schedules(name);
CREATE INDEX IF NOT EXISTS schedules_folder_id ON schedules(folder_id);
CREATE INDEX IF NOT EXISTS schedules_updated_created_idx ON schedules(updated_at DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS schedules_folder_updated_created_idx ON schedules(folder_id, updated_at DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS schedules_updated_by_email_idx ON schedules(updated_by_email);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  status TEXT NOT NULL,
  requested_at INTEGER NOT NULL,
  approved_at INTEGER,
  approved_by_email TEXT,
  last_login_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS users_status_idx ON users(status);
CREATE INDEX IF NOT EXISTS users_email_idx ON users(email);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  revoked_at INTEGER
);

CREATE INDEX IF NOT EXISTS auth_sessions_user_id_idx ON auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS auth_sessions_expires_at_idx ON auth_sessions(expires_at);
