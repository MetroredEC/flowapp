-- ============================================================
-- FLOWAPP: Formularios de cierre de proceso
-- Ejecutar con:
--   npx wrangler d1 execute flowapp-db --env production --remote --file schema_close_forms.sql
-- ============================================================

-- Campos del formulario de cierre (uno por tipo de solicitud)
CREATE TABLE IF NOT EXISTS request_type_close_fields (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  request_type_id TEXT NOT NULL REFERENCES request_types(id) ON DELETE CASCADE,
  field_key       TEXT NOT NULL,
  label           TEXT NOT NULL,
  field_type      TEXT NOT NULL DEFAULT 'text'
                  CHECK (field_type IN ('text','textarea','number','date','select','checkbox')),
  placeholder     TEXT,
  required        INTEGER NOT NULL DEFAULT 0,
  options_json    TEXT,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT DEFAULT (datetime('now')),
  UNIQUE(request_type_id, field_key)
);

CREATE INDEX IF NOT EXISTS idx_rtcf_type ON request_type_close_fields(request_type_id);

-- Registro de cierres: una fila por solicitud cerrada
CREATE TABLE IF NOT EXISTS request_closures (
  id             TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  request_id     TEXT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  closed_by_id   TEXT NOT NULL,
  closed_by_name TEXT NOT NULL,
  closed_at      TEXT NOT NULL DEFAULT (datetime('now')),
  form_data_json TEXT NOT NULL DEFAULT '{}'
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rc_request ON request_closures(request_id);

SELECT 'Tablas de cierre de proceso creadas' AS result;
