-- FlowApp Process Studio v2
-- Configuración operacional del proceso + requisitos instanciados por tarea.

ALTER TABLE process_configs ADD COLUMN workspace_id TEXT;
ALTER TABLE process_configs ADD COLUMN assignment_mode TEXT NOT NULL DEFAULT 'auto_load';
ALTER TABLE process_configs ADD COLUMN fixed_assignee_id TEXT;
ALTER TABLE process_configs ADD COLUMN fixed_assignee_name TEXT;
ALTER TABLE process_configs ADD COLUMN fixed_assignee_email TEXT;
ALTER TABLE process_configs ADD COLUMN execution_sla_days INTEGER;
ALTER TABLE process_configs ADD COLUMN checklist_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE process_configs ADD COLUMN deliverables_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE process_configs ADD COLUMN require_requester_confirmation INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS ws_task_checklist (
  id            TEXT PRIMARY KEY,
  task_id       TEXT NOT NULL,
  label         TEXT NOT NULL,
  is_required   INTEGER NOT NULL DEFAULT 1,
  is_done       INTEGER NOT NULL DEFAULT 0,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  completed_by  TEXT,
  completed_at  TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (task_id) REFERENCES ws_tasks(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_task_checklist_task ON ws_task_checklist(task_id, sort_order);

CREATE TABLE IF NOT EXISTS ws_task_deliverables (
  id            TEXT PRIMARY KEY,
  task_id       TEXT NOT NULL,
  label         TEXT NOT NULL,
  is_required   INTEGER NOT NULL DEFAULT 1,
  is_completed  INTEGER NOT NULL DEFAULT 0,
  evidence_url  TEXT,
  completed_by  TEXT,
  completed_at  TEXT,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (task_id) REFERENCES ws_tasks(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_task_deliverables_task ON ws_task_deliverables(task_id, sort_order);

