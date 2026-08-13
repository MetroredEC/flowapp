-- ============================================================
-- FLOWAPP: Tickets tipo Planner para Marketing y BI
-- Ejecutar con:
--   npx wrangler d1 execute flowapp-db --env production --remote --file schema_tickets.sql
-- ============================================================

-- Miembros del equipo por departamento (para auto-asignación)
CREATE TABLE IF NOT EXISTS dept_team_members (
  id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  user_id    TEXT NOT NULL,
  user_name  TEXT NOT NULL,
  user_email TEXT NOT NULL,
  department TEXT NOT NULL CHECK (department IN ('marketing', 'bi')),
  is_active  INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, department)
);

CREATE INDEX IF NOT EXISTS idx_dtm_dept ON dept_team_members(department, is_active);

-- Tickets de diseño / BI
CREATE TABLE IF NOT EXISTS design_tickets (
  id               TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(12)))),
  department       TEXT NOT NULL CHECK (department IN ('marketing', 'bi')),
  title            TEXT NOT NULL,
  description      TEXT,
  priority         TEXT NOT NULL DEFAULT 'normal'
                   CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  status           TEXT NOT NULL DEFAULT 'todo'
                   CHECK (status IN ('todo', 'in_progress', 'review', 'done')),
  assigned_to_id   TEXT,
  assigned_to_name TEXT,
  assigned_to_email TEXT,
  created_by_id    TEXT NOT NULL,
  created_by_name  TEXT NOT NULL,
  due_date         TEXT,
  tags_json        TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_dt_dept   ON design_tickets(department, status);
CREATE INDEX IF NOT EXISTS idx_dt_assign ON design_tickets(assigned_to_id);

SELECT 'Tablas de tickets creadas' AS result;
