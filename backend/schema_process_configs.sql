-- ============================================================
-- FLOWAPP: Configuración completa de proceso (wizard)
-- Ejecutar con:
--   npx wrangler d1 execute flowapp-db --env production --remote --file schema_process_configs.sql
-- ============================================================

-- Configuración JSON completa generada por el Process Wizard
CREATE TABLE IF NOT EXISTS process_configs (
  id                TEXT PRIMARY KEY,  -- mismo que request_type_id
  form_schema_json  TEXT NOT NULL DEFAULT '[]',
  close_schema_json TEXT NOT NULL DEFAULT '[]',
  email_subject     TEXT,
  email_body        TEXT,
  send_on_approve   INTEGER NOT NULL DEFAULT 1,
  color             TEXT NOT NULL DEFAULT '#7C3AED',
  icon              TEXT NOT NULL DEFAULT 'flow',
  category          TEXT,
  default_sla_days  INTEGER NOT NULL DEFAULT 5,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

SELECT 'Tabla process_configs creada' AS result;
