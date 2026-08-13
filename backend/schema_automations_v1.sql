-- FlowApp Sprint 6: automatizaciones sin código (Cuando / Si / Entonces).
-- D1 ejecuta el archivo de forma atómica; no usar BEGIN/COMMIT explícitos.
-- npx wrangler d1 execute flowapp-db --env production --remote --file schema_automations_v1.sql
--
-- No se reutiliza la tabla automation_rules de schema_bpm.sql: cuelga de
-- process_definitions, que pertenece al módulo BPM paralelo y no al motor de
-- solicitudes y tareas que usa la aplicación.

CREATE TABLE IF NOT EXISTS automations (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  name            TEXT NOT NULL,
  description     TEXT,
  -- Ámbito: NULL significa "cualquiera".
  process_id      TEXT,
  space_id        TEXT,
  trigger_event   TEXT NOT NULL,
  conditions_json TEXT NOT NULL DEFAULT '[]',
  actions_json    TEXT NOT NULL DEFAULT '[]',
  is_active       INTEGER NOT NULL DEFAULT 1,
  created_by      TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_automations_trigger
  ON automations(trigger_event, is_active);

-- Bitácora de ejecución. Sin esto una automatización es una caja negra: no se
-- puede explicar por qué una tarea cambió sola, ni medir cuánto trabajo ahorra.
CREATE TABLE IF NOT EXISTS automation_runs (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  automation_id   TEXT NOT NULL,
  automation_name TEXT,
  event_type      TEXT NOT NULL,
  request_id      TEXT,
  task_id         TEXT,
  matched         INTEGER NOT NULL DEFAULT 0,
  actions_applied TEXT,
  error           TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_automation_runs_automation
  ON automation_runs(automation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_automation_runs_created
  ON automation_runs(created_at DESC);

CREATE TABLE IF NOT EXISTS app_migrations (
  id          TEXT PRIMARY KEY,
  applied_at  TEXT NOT NULL DEFAULT (datetime('now')),
  detail_json TEXT
);

INSERT INTO app_migrations (id, applied_at, detail_json)
VALUES ('automations_v1', datetime('now'), json_object('status', 'complete'))
ON CONFLICT(id) DO UPDATE SET applied_at = excluded.applied_at, detail_json = excluded.detail_json;

SELECT (SELECT COUNT(*) FROM automations) AS automatizaciones;
