-- Sprint 2: centro de trabajo diario.
-- Ejecutar una sola vez en D1 production.

ALTER TABLE ws_tasks ADD COLUMN planned_date TEXT;
ALTER TABLE ws_tasks ADD COLUMN day_order INTEGER;
ALTER TABLE ws_tasks ADD COLUMN snoozed_until TEXT;
ALTER TABLE ws_tasks ADD COLUMN is_blocked INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ws_tasks ADD COLUMN blocked_reason TEXT;
ALTER TABLE ws_tasks ADD COLUMN estimate_minutes INTEGER;

CREATE INDEX IF NOT EXISTS idx_tasks_planned
  ON ws_tasks(assignee_email, planned_date, day_order);
CREATE INDEX IF NOT EXISTS idx_tasks_blocked
  ON ws_tasks(assignee_email, is_blocked, archived);

CREATE TABLE IF NOT EXISTS app_migrations (
  id          TEXT PRIMARY KEY,
  applied_at  TEXT NOT NULL DEFAULT (datetime('now')),
  detail_json TEXT
);

INSERT INTO app_migrations (id, applied_at, detail_json)
VALUES ('work_center_v1', datetime('now'), json_object('status', 'complete'))
ON CONFLICT(id) DO UPDATE SET applied_at = excluded.applied_at, detail_json = excluded.detail_json;
