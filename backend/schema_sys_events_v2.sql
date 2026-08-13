-- Migración incremental para instalaciones que ya tienen sys_events.
ALTER TABLE sys_events ADD COLUMN severity TEXT NOT NULL DEFAULT 'info';
ALTER TABLE sys_events ADD COLUMN trace_id TEXT;
ALTER TABLE sys_events ADD COLUMN source TEXT;
ALTER TABLE sys_events ADD COLUMN duration_ms INTEGER;
ALTER TABLE sys_events ADD COLUMN http_status INTEGER;

CREATE INDEX IF NOT EXISTS idx_sys_events_trace ON sys_events(trace_id, at DESC);
CREATE INDEX IF NOT EXISTS idx_sys_events_ref ON sys_events(ref_type, ref_id, at DESC);

CREATE TABLE IF NOT EXISTS sys_test_runs (
  id            TEXT PRIMARY KEY,
  started_at    TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at  TEXT,
  status        TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running','passed','partial','failed')),
  initiated_by  TEXT,
  summary_json  TEXT
);
