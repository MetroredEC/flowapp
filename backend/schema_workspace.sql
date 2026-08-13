-- ============================================================
-- FLOWAPP WORKSPACE — Núcleo de colaboración (tipo ClickUp/Slack)
-- Modelo unificado: Espacios → Tareas → Comentarios + Actividad
-- + Bandeja de notificaciones
-- ============================================================

-- ─── ESPACIOS (áreas de trabajo) ─────────────────────────────
CREATE TABLE IF NOT EXISTS ws_spaces (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  color       TEXT NOT NULL DEFAULT '#0284C7',
  icon        TEXT NOT NULL DEFAULT 'folder',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── ESTADOS por espacio (columnas del tablero, configurable) ─
CREATE TABLE IF NOT EXISTS ws_space_statuses (
  id          TEXT PRIMARY KEY,
  space_id    TEXT NOT NULL,
  key         TEXT NOT NULL,
  label       TEXT NOT NULL,
  color       TEXT NOT NULL DEFAULT '#888880',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_done     INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (space_id) REFERENCES ws_spaces(id) ON DELETE CASCADE
);

-- ─── TAREAS (objeto universal) ───────────────────────────────
CREATE TABLE IF NOT EXISTS ws_tasks (
  id                TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  space_id          TEXT NOT NULL,
  title             TEXT NOT NULL,
  description       TEXT,
  status            TEXT NOT NULL DEFAULT 'todo',
  priority          TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  assignee_id       TEXT,
  assignee_name     TEXT,
  assignee_email    TEXT,
  created_by_id     TEXT,
  created_by_name   TEXT,
  created_by_email  TEXT,
  due_date          TEXT,
  -- Trazabilidad de origen: manual | request | sale | ticket
  source_type       TEXT NOT NULL DEFAULT 'manual',
  source_id         TEXT,
  -- Datos del formulario de intake (JSON de campos personalizados)
  custom_fields_json TEXT,
  -- Aprobación opcional
  needs_approval    INTEGER NOT NULL DEFAULT 0,
  approval_status   TEXT,          -- null | pending | approved | rejected
  approver_email    TEXT,
  approver_name     TEXT,
  archived          INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  started_at        TEXT,
  completed_at      TEXT,
  planned_date      TEXT,
  day_order         INTEGER,
  snoozed_until     TEXT,
  is_blocked        INTEGER NOT NULL DEFAULT 0,
  blocked_reason    TEXT,
  estimate_minutes  INTEGER,
  FOREIGN KEY (space_id) REFERENCES ws_spaces(id)
);

CREATE INDEX IF NOT EXISTS idx_tasks_space    ON ws_tasks(space_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON ws_tasks(assignee_email);
CREATE INDEX IF NOT EXISTS idx_tasks_status   ON ws_tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_updated  ON ws_tasks(updated_at);
CREATE INDEX IF NOT EXISTS idx_tasks_planned  ON ws_tasks(assignee_email, planned_date, day_order);
CREATE INDEX IF NOT EXISTS idx_tasks_blocked  ON ws_tasks(assignee_email, is_blocked, archived);

-- ─── COMENTARIOS (chat por tarea, con @menciones) ────────────
CREATE TABLE IF NOT EXISTS ws_task_comments (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  task_id       TEXT NOT NULL,
  author_id     TEXT,
  author_name   TEXT NOT NULL,
  author_email  TEXT NOT NULL,
  body          TEXT NOT NULL,
  mentions_json TEXT,   -- ["email1","email2"]
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (task_id) REFERENCES ws_tasks(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_comments_task ON ws_task_comments(task_id);

-- ─── ACTIVIDAD (historial inmutable por tarea) ───────────────
CREATE TABLE IF NOT EXISTS ws_task_activity (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  task_id     TEXT NOT NULL,
  actor_id    TEXT,
  actor_name  TEXT NOT NULL,
  actor_email TEXT,
  action      TEXT NOT NULL,   -- created|status|assigned|priority|comment|approved|rejected|due|field
  meta_json   TEXT,            -- {from, to, ...}
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (task_id) REFERENCES ws_tasks(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_activity_task ON ws_task_activity(task_id);

-- ─── NOTIFICACIONES (Bandeja) ────────────────────────────────
CREATE TABLE IF NOT EXISTS ws_notifications (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  user_email  TEXT NOT NULL,
  type        TEXT NOT NULL,   -- mention|assignment|status|approval|comment
  task_id     TEXT,
  task_title  TEXT,
  space_id    TEXT,
  actor_name  TEXT,
  body        TEXT,
  is_read     INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON ws_notifications(user_email, is_read);
CREATE INDEX IF NOT EXISTS idx_notif_created ON ws_notifications(created_at);

-- ============================================================
-- SEED: 5 espacios de Metrored
-- ============================================================
INSERT OR REPLACE INTO ws_spaces (id, name, color, icon, sort_order) VALUES
  ('comercial',   'Comercial',    '#378ADD', 'briefcase',   1),
  ('marketing',   'Marketing',    '#D4537E', 'palette',     2),
  ('bi',          'BI',           '#1D9E75', 'chart-bar',   3),
  ('sso',         'SSO',          '#BA7517', 'trending-up', 4),
  ('operaciones', 'Operaciones',  '#534AB7', 'settings',    5);

-- Estados por defecto para cada espacio
DELETE FROM ws_space_statuses;
INSERT INTO ws_space_statuses (id, space_id, key, label, color, sort_order, is_done) VALUES
  -- Comercial
  ('comercial-todo',   'comercial', 'todo',        'Por hacer',   '#888880', 0, 0),
  ('comercial-prog',   'comercial', 'in_progress', 'En progreso', '#378ADD', 1, 0),
  ('comercial-rev',    'comercial', 'review',      'Revisión',    '#BA7517', 2, 0),
  ('comercial-done',   'comercial', 'done',        'Listo',       '#1D9E75', 3, 1),
  -- Marketing
  ('marketing-todo',   'marketing', 'todo',        'Por hacer',   '#888880', 0, 0),
  ('marketing-prog',   'marketing', 'in_progress', 'En progreso', '#D4537E', 1, 0),
  ('marketing-rev',    'marketing', 'review',      'Revisión',    '#BA7517', 2, 0),
  ('marketing-done',   'marketing', 'done',        'Listo',       '#1D9E75', 3, 1),
  -- BI
  ('bi-todo',          'bi',        'todo',        'Por hacer',   '#888880', 0, 0),
  ('bi-prog',          'bi',        'in_progress', 'En desarrollo','#1D9E75', 1, 0),
  ('bi-rev',           'bi',        'review',      'Validación',  '#BA7517', 2, 0),
  ('bi-done',          'bi',        'done',        'Entregado',   '#0F6E56', 3, 1),
  -- SSO (embudo de ventas)
  ('sso-prospecto',    'sso',       'prospecto',       'Prospecto',   '#888880', 0, 0),
  ('sso-negociacion',  'sso',       'negociacion',     'Negociación', '#378ADD', 1, 0),
  ('sso-propuesta',    'sso',       'propuesta',       'Propuesta',   '#BA7517', 2, 0),
  ('sso-ganado',       'sso',       'cerrado_ganado',  'Ganado',      '#1D9E75', 3, 1),
  ('sso-perdido',      'sso',       'cerrado_perdido', 'Perdido',     '#A32D2D', 4, 1),
  -- Operaciones
  ('ope-nuevo',        'operaciones','todo',        'Nuevo',       '#888880', 0, 0),
  ('ope-prog',         'operaciones','in_progress', 'En gestión',  '#534AB7', 1, 0),
  ('ope-rev',          'operaciones','review',      'Verificación','#BA7517', 2, 0),
  ('ope-done',         'operaciones','done',        'Implementado','#1D9E75', 3, 1);

SELECT 'Workspace schema creado: ' || (SELECT COUNT(*) FROM ws_spaces) || ' espacios' AS result;
