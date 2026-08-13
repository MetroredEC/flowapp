-- ============================================================
-- FLOWAPP: Tabla de campos de formulario por tipo de solicitud
-- Ejecutar con:
--   npx wrangler d1 execute flowapp-db --env production --remote --file schema_form_fields.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS request_type_fields (
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

CREATE INDEX IF NOT EXISTS idx_rtf_type ON request_type_fields(request_type_id);

SELECT 'Tabla request_type_fields creada' AS result;
