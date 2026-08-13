-- Amplía los campos dinámicos para que el formulario publicado conserve
-- exactamente los tipos diseñados en el wizard.
PRAGMA foreign_keys = OFF;

DROP INDEX IF EXISTS idx_rtf_type;

CREATE TABLE request_type_fields_v2 (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  request_type_id TEXT NOT NULL REFERENCES request_types(id) ON DELETE CASCADE,
  field_key       TEXT NOT NULL,
  label           TEXT NOT NULL,
  field_type      TEXT NOT NULL DEFAULT 'text'
                  CHECK (field_type IN (
                    'text','email','textarea','number','date','select','checkbox',
                    'radio','checkbox_group','file','section'
                  )),
  placeholder     TEXT,
  required        INTEGER NOT NULL DEFAULT 0,
  options_json    TEXT,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT DEFAULT (datetime('now')),
  UNIQUE(request_type_id, field_key)
);

INSERT INTO request_type_fields_v2
  (id, request_type_id, field_key, label, field_type, placeholder, required, options_json, sort_order, created_at)
SELECT id, request_type_id, field_key, label, field_type, placeholder, required, options_json, sort_order, created_at
FROM request_type_fields;

DROP TABLE request_type_fields;
ALTER TABLE request_type_fields_v2 RENAME TO request_type_fields;
CREATE INDEX idx_rtf_type ON request_type_fields(request_type_id);

PRAGMA foreign_keys = ON;

SELECT 'request_type_fields ampliada' AS result, COUNT(*) AS rows_preserved
FROM request_type_fields;
