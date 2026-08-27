-- FlowApp Sprint 10: preguntas condicionales (arbol de decisiones dentro del formulario).
-- D1 ejecuta el archivo de forma atomica; no usar BEGIN/COMMIT explicitos.
-- npx wrangler d1 execute flowapp-db --env production --remote --file schema_conditional_fields_v1.sql
--
-- Una pregunta puede depender de la respuesta a otra. Con esto el formulario
-- deja de ser una lista fija y se vuelve un recorrido: cada quien solo ve lo
-- que aplica a su caso, y el formulario se acorta solo.
--
-- Formato de visible_if_json:
--   {"field":"tipo_pieza","op":"eq","value":"Impresa"}
-- Nulo o vacio significa "siempre visible", que es como se comportaba antes.

ALTER TABLE request_type_fields ADD COLUMN visible_if_json TEXT;

CREATE TABLE IF NOT EXISTS app_migrations (
  id          TEXT PRIMARY KEY,
  applied_at  TEXT NOT NULL DEFAULT (datetime('now')),
  detail_json TEXT
);

INSERT INTO app_migrations (id, applied_at, detail_json)
VALUES ('conditional_fields_v1', datetime('now'), json_object('status', 'complete'))
ON CONFLICT(id) DO UPDATE SET applied_at = excluded.applied_at, detail_json = excluded.detail_json;

SELECT COUNT(*) AS campos FROM request_type_fields;
