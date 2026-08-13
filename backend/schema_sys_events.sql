-- Registro persistente y correlacionado de eventos del pipeline.
CREATE TABLE IF NOT EXISTS sys_events (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  at          TEXT NOT NULL DEFAULT (datetime('now')),
  category    TEXT NOT NULL,
  action      TEXT NOT NULL,
  ok          INTEGER NOT NULL DEFAULT 1,
  severity    TEXT NOT NULL DEFAULT 'info',
  trace_id    TEXT,
  source      TEXT,
  ref_type    TEXT,
  ref_id      TEXT,
  actor       TEXT,
  duration_ms INTEGER,
  http_status INTEGER,
  detail      TEXT
);

CREATE INDEX IF NOT EXISTS idx_sys_events_at ON sys_events(at DESC);
CREATE INDEX IF NOT EXISTS idx_sys_events_cat ON sys_events(category, ok);
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

SELECT 'sys_events listo' AS result;
