-- FlowApp: ramificacion de formularios y notificaciones programadas.
-- D1 ejecuta el archivo de forma atomica; no usar BEGIN/COMMIT explicitos.
-- npx wrangler d1 execute flowapp-db --env production --remote --file schema_branching_scheduling_v1.sql

-- ─── 1. Ramificacion ────────────────────────────────────────────────────────
-- visible_if_json responde "esta pregunta aplica?"; branch_json responde
-- "a donde voy despues de responderla". Son complementarios: la visibilidad
-- filtra y el salto reordena, y juntos permiten arboles de varios niveles.
--
-- Formato: {"rules":[{"value":"Impresa","goto":"medidas"}],"default":null}
--   goto = field_key destino, o "__end__" para terminar el formulario aqui.
--   Nulo o vacio significa "sigue la secuencia normal".
ALTER TABLE request_type_fields ADD COLUMN branch_json TEXT;

-- ─── 2. Notificacion programada ─────────────────────────────────────────────
-- immediate  = como hasta ahora, al enviar
-- fixed      = a los N dias del envio, a una hora dada
-- from_field = a partir de una fecha que el propio formulario capturo
ALTER TABLE process_configs ADD COLUMN notify_mode TEXT NOT NULL DEFAULT 'immediate';
ALTER TABLE process_configs ADD COLUMN notify_field_key TEXT;
ALTER TABLE process_configs ADD COLUMN notify_offset_days INTEGER NOT NULL DEFAULT 0;
ALTER TABLE process_configs ADD COLUMN notify_time TEXT;
-- Permite que ademas el solicitante elija la fecha al enviar. Puede convivir
-- con las reglas anteriores: lo que el solicitante elige manda.
ALTER TABLE process_configs ADD COLUMN allow_requester_schedule INTEGER NOT NULL DEFAULT 0;

-- Momento calculado para avisar al aprobador, y cuando se aviso de verdad.
-- Si scheduled_notify_at es futuro, el envio no notifica: lo hace el barrido.
ALTER TABLE requests ADD COLUMN scheduled_notify_at TEXT;
ALTER TABLE requests ADD COLUMN notified_at TEXT;

CREATE INDEX IF NOT EXISTS idx_requests_scheduled_notify
  ON requests(scheduled_notify_at, notified_at);

CREATE TABLE IF NOT EXISTS app_migrations (
  id          TEXT PRIMARY KEY,
  applied_at  TEXT NOT NULL DEFAULT (datetime('now')),
  detail_json TEXT
);

INSERT INTO app_migrations (id, applied_at, detail_json)
VALUES ('branching_scheduling_v1', datetime('now'), json_object('status', 'complete'))
ON CONFLICT(id) DO UPDATE SET applied_at = excluded.applied_at, detail_json = excluded.detail_json;

-- Las solicitudes ya enviadas se consideran notificadas: sin esto el barrido
-- las tomaria como pendientes y volveria a avisar a sus aprobadores.
UPDATE requests SET notified_at = COALESCE(notified_at, submitted_at)
WHERE submitted_at IS NOT NULL;

SELECT
  (SELECT COUNT(*) FROM requests WHERE notified_at IS NOT NULL) AS ya_notificadas,
  (SELECT COUNT(*) FROM request_type_fields) AS campos;
