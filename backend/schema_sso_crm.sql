-- ============================================================
-- SSO CRM — Actividades comerciales + seguimiento
-- ============================================================

-- Timeline de actividades por oportunidad (notas, llamadas, reuniones…)
CREATE TABLE IF NOT EXISTS sso_activities (
  id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  sale_id      TEXT NOT NULL,
  type         TEXT NOT NULL DEFAULT 'nota',  -- nota|llamada|reunion|correo|whatsapp|etapa
  body         TEXT NOT NULL,
  author_name  TEXT,
  author_email TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sso_act_sale ON sso_activities(sale_id, created_at);

-- Campos de seguimiento en la oportunidad
ALTER TABLE sso_sales ADD COLUMN origen TEXT;
ALTER TABLE sso_sales ADD COLUMN proxima_accion TEXT;
ALTER TABLE sso_sales ADD COLUMN proxima_accion_fecha TEXT;

SELECT 'SSO CRM schema aplicado' AS result;
