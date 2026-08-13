-- FlowApp Sprint 7: disparadores por tiempo y avisos fuera de la aplicación.
-- D1 ejecuta el archivo de forma atómica; no usar BEGIN/COMMIT explícitos.
-- npx wrangler d1 execute flowapp-db --env production --remote --file schema_automations_time_v1.sql

-- Bandeja de salida.
--
-- El motor corre dentro de recordWorkEvent, que recibe la base de datos pero
-- no el entorno: no tiene acceso al webhook de Teams ni al token de Graph.
-- En vez de arrastrar `env` por quince rutas, el aviso externo se encola aquí
-- y lo envía el proceso programado, que sí lo tiene. De paso queda el intento
-- registrado y se puede reintentar.
CREATE TABLE IF NOT EXISTS automation_outbox (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  automation_id   TEXT NOT NULL,
  automation_name TEXT,
  channel         TEXT NOT NULL CHECK (channel IN ('teams','email')),
  target          TEXT,
  subject         TEXT,
  body            TEXT NOT NULL,
  request_id      TEXT,
  task_id         TEXT,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
  attempts        INTEGER NOT NULL DEFAULT 0,
  last_error      TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  sent_at         TEXT
);

CREATE INDEX IF NOT EXISTS idx_outbox_pending
  ON automation_outbox(status, created_at);

-- Marcas de deduplicación.
--
-- El barrido corre cada quince minutos. Sin esto, una regla de "vence mañana"
-- avisaría noventa y seis veces al día por la misma tarea. La clave incluye el
-- día operativo, así que cada regla actúa como mucho una vez al día sobre la
-- misma tarea o solicitud.
CREATE TABLE IF NOT EXISTS automation_time_marks (
  id         TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_time_marks_created
  ON automation_time_marks(created_at);

CREATE TABLE IF NOT EXISTS app_migrations (
  id          TEXT PRIMARY KEY,
  applied_at  TEXT NOT NULL DEFAULT (datetime('now')),
  detail_json TEXT
);

INSERT INTO app_migrations (id, applied_at, detail_json)
VALUES ('automations_time_v1', datetime('now'), json_object('status', 'complete'))
ON CONFLICT(id) DO UPDATE SET applied_at = excluded.applied_at, detail_json = excluded.detail_json;

SELECT
  (SELECT COUNT(*) FROM automation_outbox) AS pendientes,
  (SELECT COUNT(*) FROM automation_time_marks) AS marcas;
