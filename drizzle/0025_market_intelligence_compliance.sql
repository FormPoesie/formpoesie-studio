CREATE TABLE IF NOT EXISTS automation_run_locks (
  lock_key TEXT PRIMARY KEY NOT NULL,
  created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_automation_run_locks_created
  ON automation_run_locks (created_at);
