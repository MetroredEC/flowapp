-- FlowApp Sprint 3: personas y pantalla principal adaptada.
-- D1 ejecuta el archivo de forma atómica; no usar BEGIN/COMMIT explícitos.
-- npx wrangler d1 execute flowapp-db --env production --remote --file schema_personas_v1.sql

-- Membresía de espacio con rol. Es la fuente de verdad del "líder de área".
CREATE TABLE IF NOT EXISTS ws_space_members (
  id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  space_id   TEXT NOT NULL REFERENCES ws_spaces(id) ON DELETE CASCADE,
  user_email TEXT NOT NULL,
  user_name  TEXT,
  role       TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('lead','member')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(space_id, user_email)
);

CREATE INDEX IF NOT EXISTS idx_space_members_user
  ON ws_space_members(user_email, role);
CREATE INDEX IF NOT EXISTS idx_space_members_space
  ON ws_space_members(space_id, role);

-- Preferencias por usuario. persona = null significa detección automática.
CREATE TABLE IF NOT EXISTS user_preferences (
  user_email        TEXT PRIMARY KEY,
  preferred_persona TEXT,
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Backfill: quien ya tiene trabajo asignado en un espacio es miembro de ese espacio.
-- No asigna líderes: eso lo decide un administrador de forma explícita.
INSERT OR IGNORE INTO ws_space_members (id, space_id, user_email, user_name, role)
SELECT lower(hex(randomblob(8))), t.space_id, lower(t.assignee_email),
       MAX(t.assignee_name), 'member'
FROM ws_tasks t
WHERE t.assignee_email IS NOT NULL AND trim(t.assignee_email) <> ''
GROUP BY t.space_id, lower(t.assignee_email);

CREATE TABLE IF NOT EXISTS app_migrations (
  id          TEXT PRIMARY KEY,
  applied_at  TEXT NOT NULL DEFAULT (datetime('now')),
  detail_json TEXT
);

INSERT INTO app_migrations (id, applied_at, detail_json)
VALUES ('personas_v1', datetime('now'), json_object('status', 'complete'))
ON CONFLICT(id) DO UPDATE SET applied_at = excluded.applied_at, detail_json = excluded.detail_json;

SELECT
  (SELECT COUNT(*) FROM ws_space_members) AS space_members,
  (SELECT COUNT(*) FROM ws_space_members WHERE role = 'lead') AS leads;
