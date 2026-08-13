-- FlowApp Sprint 8: capacidad real del equipo.
-- D1 ejecuta el archivo de forma atómica; no usar BEGIN/COMMIT explícitos.
-- npx wrangler d1 execute flowapp-db --env production --remote --file schema_capacity_v1.sql
--
-- Hasta ahora la asignación automática leía dept_team_members, cuya columna
-- department solo admite 'marketing' y 'bi' mientras los espacios son cinco, y
-- que además está vacía: autoAssignForSpace devolvía null siempre y la tarea
-- nacía sin responsable. La fuente correcta es ws_space_members.

ALTER TABLE ws_space_members ADD COLUMN weekly_hours INTEGER NOT NULL DEFAULT 30;
ALTER TABLE ws_space_members ADD COLUMN specialties_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE ws_space_members ADD COLUMN accepts_auto_assign INTEGER NOT NULL DEFAULT 1;

-- Ausencias. Una persona ausente no debe recibir trabajo nuevo aunque su carga
-- se vea baja: justamente se ve baja porque no está.
CREATE TABLE IF NOT EXISTS member_absences (
  id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  user_email TEXT NOT NULL,
  starts_on  TEXT NOT NULL,
  ends_on    TEXT NOT NULL,
  reason     TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_absences_user
  ON member_absences(user_email, starts_on, ends_on);

-- Complejidad estimada del trabajo, para que la carga no se mida solo en
-- número de tareas. Se guarda en la tarea porque puede ajustarse durante la
-- ejecución, no solo al crearla.
ALTER TABLE ws_tasks ADD COLUMN complexity TEXT NOT NULL DEFAULT 'normal';

CREATE TABLE IF NOT EXISTS app_migrations (
  id          TEXT PRIMARY KEY,
  applied_at  TEXT NOT NULL DEFAULT (datetime('now')),
  detail_json TEXT
);

INSERT INTO app_migrations (id, applied_at, detail_json)
VALUES ('capacity_v1', datetime('now'), json_object('status', 'complete'))
ON CONFLICT(id) DO UPDATE SET applied_at = excluded.applied_at, detail_json = excluded.detail_json;

SELECT
  (SELECT COUNT(*) FROM ws_space_members) AS miembros,
  (SELECT COUNT(*) FROM member_absences)  AS ausencias;
