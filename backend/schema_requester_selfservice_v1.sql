-- FlowApp Sprint 4: autogestión del solicitante.
-- D1 ejecuta el archivo de forma atómica; no usar BEGIN/COMMIT explícitos.
-- npx wrangler d1 execute flowapp-db --env production --remote --file schema_requester_selfservice_v1.sql
--
-- requests.status tiene un CHECK que SQLite no permite alterar sin reconstruir
-- la tabla. Por eso el ciclo de entrega se modela con marcas de tiempo dentro
-- del estado 'approved' y no con estados nuevos: mismo resultado, sin migración
-- destructiva sobre datos en producción.

ALTER TABLE requests ADD COLUMN delivered_at   TEXT;
ALTER TABLE requests ADD COLUMN confirmed_at   TEXT;
ALTER TABLE requests ADD COLUMN reopen_due_at  TEXT;
ALTER TABLE requests ADD COLUMN reopen_count   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE requests ADD COLUMN cancel_reason  TEXT;

CREATE INDEX IF NOT EXISTS idx_requests_requester
  ON requests(requester_id, status);
CREATE INDEX IF NOT EXISTS idx_requests_delivery
  ON requests(delivered_at, confirmed_at);

-- Calificación del servicio por el solicitante.
CREATE TABLE IF NOT EXISTS request_feedback (
  request_id    TEXT PRIMARY KEY REFERENCES requests(id) ON DELETE CASCADE,
  rating        INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment       TEXT,
  rated_by_id   TEXT,
  rated_by_name TEXT,
  rated_by_email TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Devoluciones del solicitante: por qué no aceptó la entrega.
CREATE TABLE IF NOT EXISTS request_returns (
  id             TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  request_id     TEXT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  reason         TEXT NOT NULL,
  returned_by_id TEXT,
  returned_by_name TEXT,
  returned_by_email TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_request_returns_request
  ON request_returns(request_id, created_at DESC);

-- Solicitudes ya cerradas se consideran entregadas y confirmadas: sin esto
-- aparecerían pidiendo una confirmación que ocurrió antes de existir la función.
UPDATE requests
SET delivered_at = COALESCE(delivered_at, closed_at),
    confirmed_at = COALESCE(confirmed_at, closed_at)
WHERE closed_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS app_migrations (
  id          TEXT PRIMARY KEY,
  applied_at  TEXT NOT NULL DEFAULT (datetime('now')),
  detail_json TEXT
);

INSERT INTO app_migrations (id, applied_at, detail_json)
VALUES ('requester_selfservice_v1', datetime('now'), json_object('status', 'complete'))
ON CONFLICT(id) DO UPDATE SET applied_at = excluded.applied_at, detail_json = excluded.detail_json;

SELECT
  (SELECT COUNT(*) FROM requests WHERE delivered_at IS NOT NULL) AS entregadas,
  (SELECT COUNT(*) FROM requests WHERE confirmed_at IS NOT NULL) AS confirmadas;
