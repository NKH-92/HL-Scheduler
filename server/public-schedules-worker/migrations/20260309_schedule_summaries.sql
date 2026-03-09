ALTER TABLE schedules ADD COLUMN holding_reason TEXT;
ALTER TABLE schedules ADD COLUMN next_action TEXT;
ALTER TABLE schedules ADD COLUMN recent_activity_json TEXT;
ALTER TABLE schedules ADD COLUMN overview_json TEXT;

CREATE INDEX IF NOT EXISTS schedules_updated_created_idx ON schedules(updated_at DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS schedules_folder_updated_created_idx ON schedules(folder_id, updated_at DESC, created_at DESC);
