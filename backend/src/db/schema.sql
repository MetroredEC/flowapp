PRAGMA foreign_keys = ON;

-- Tipos de solicitud
CREATE TABLE IF NOT EXISTS request_types (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  name        TEXT NOT NULL UNIQUE,
  description TEXT,
  is_active   INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Versiones inmutables de la configuración publicada
CREATE TABLE IF NOT EXISTS process_versions (
  id            TEXT PRIMARY KEY,
  process_id    TEXT NOT NULL REFERENCES request_types(id),
  version       INTEGER NOT NULL,
  name          TEXT NOT NULL,
  description   TEXT,
  snapshot_json TEXT NOT NULL,
  created_by    TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(process_id, version)
);

-- Configuración de niveles de aprobación por tipo
CREATE TABLE IF NOT EXISTS flow_configs (
  id               TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  request_type_id  TEXT NOT NULL REFERENCES request_types(id) ON DELETE CASCADE,
  level            INTEGER NOT NULL CHECK (level BETWEEN 1 AND 4),
  label            TEXT NOT NULL,
  approver_type    TEXT NOT NULL CHECK (approver_type IN ('fixed_user','job_title')),
  approver_value   TEXT NOT NULL,
  approver_name    TEXT,
  approver_email   TEXT,
  is_active        INTEGER NOT NULL DEFAULT 1,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(request_type_id, level)
);

-- Solicitudes
CREATE TABLE IF NOT EXISTS requests (
  id               TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  request_type_id  TEXT NOT NULL REFERENCES request_types(id),
  request_type_name TEXT NOT NULL,
  title            TEXT NOT NULL,
  description      TEXT NOT NULL,
  requester_id     TEXT NOT NULL,
  requester_name   TEXT NOT NULL,
  requester_email  TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('draft','pending','in_progress','approved','rejected','cancelled')),
  current_level    INTEGER NOT NULL DEFAULT 1,
  total_levels     INTEGER NOT NULL DEFAULT 4,
  campaign_data    TEXT,
  process_version_id TEXT,
  process_version  INTEGER,
  submitted_at     TEXT,
  approved_at      TEXT,
  rejected_at      TEXT,
  cancelled_at     TEXT,
  closed_at        TEXT,
  sla_due_at       TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Archivos adjuntos en R2
CREATE TABLE IF NOT EXISTS attachments (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(12)))),
  request_id    TEXT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  filename      TEXT NOT NULL,
  r2_key        TEXT NOT NULL UNIQUE,
  content_type  TEXT NOT NULL,
  size_bytes    INTEGER NOT NULL DEFAULT 0,
  is_selected   INTEGER NOT NULL DEFAULT 0,
  uploaded_by   TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Pasos de aprobación
CREATE TABLE IF NOT EXISTS approval_steps (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(12)))),
  request_id      TEXT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  level           INTEGER NOT NULL CHECK (level BETWEEN 1 AND 4),
  label           TEXT NOT NULL DEFAULT '',
  approver_id     TEXT NOT NULL,
  approver_name   TEXT NOT NULL,
  approver_email  TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','approved','rejected','skipped')),
  comment         TEXT,
  decided_at      TEXT,
  notified_at     TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(request_id, level)
);

-- Línea de tiempo transversal solicitud → aprobación → tarea → cierre
CREATE TABLE IF NOT EXISTS work_events (
  id          TEXT PRIMARY KEY,
  request_id  TEXT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  task_id     TEXT,
  event_type  TEXT NOT NULL,
  title       TEXT NOT NULL,
  actor_id    TEXT,
  actor_name  TEXT,
  actor_email TEXT,
  detail_json TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Tokens magic link (un solo uso, 72h)
CREATE TABLE IF NOT EXISTS approval_tokens (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(24)))),
  step_id     TEXT NOT NULL REFERENCES approval_steps(id) ON DELETE CASCADE,
  request_id  TEXT NOT NULL,
  action      TEXT NOT NULL CHECK (action IN ('approve','reject')),
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TEXT NOT NULL,
  used_at     TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Costo de campaña (Marketing)
CREATE TABLE IF NOT EXISTS campaign_costs (
  id             TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(12)))),
  request_id     TEXT NOT NULL UNIQUE REFERENCES requests(id),
  campaign_code  TEXT NOT NULL,
  total_amount   REAL NOT NULL,
  currency       TEXT NOT NULL DEFAULT 'USD',
  execution_date TEXT NOT NULL,
  billing_date   TEXT NOT NULL,
  notes          TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Proveedores por campaña
CREATE TABLE IF NOT EXISTS campaign_vendors (
  id               TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(12)))),
  campaign_cost_id TEXT NOT NULL REFERENCES campaign_costs(id) ON DELETE CASCADE,
  vendor_name      TEXT NOT NULL,
  amount           REAL NOT NULL,
  proposal_r2_key  TEXT,
  is_selected      INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Audit log
CREATE TABLE IF NOT EXISTS audit_log (
  id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(12)))),
  entity     TEXT NOT NULL,
  entity_id  TEXT NOT NULL,
  action     TEXT NOT NULL,
  actor_id   TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  details    TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_requests_requester  ON requests(requester_id);
CREATE INDEX IF NOT EXISTS idx_requests_status     ON requests(status);
CREATE INDEX IF NOT EXISTS idx_requests_type       ON requests(request_type_id);
CREATE INDEX IF NOT EXISTS idx_steps_request       ON approval_steps(request_id);
CREATE INDEX IF NOT EXISTS idx_tokens_hash         ON approval_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_tokens_step         ON approval_tokens(step_id);
CREATE INDEX IF NOT EXISTS idx_attachments_req     ON attachments(request_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity        ON audit_log(entity, entity_id);
CREATE INDEX IF NOT EXISTS idx_process_versions    ON process_versions(process_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_work_events_request ON work_events(request_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_work_events_task    ON work_events(task_id, created_at DESC);

-- Datos iniciales
INSERT OR IGNORE INTO request_types (id, name, description) VALUES
  ('type-mkt', 'Marketing',              'Solicitudes de campañas y activaciones'),
  ('type-cmp', 'Compras',                'Solicitudes de adquisición de bienes y servicios'),
  ('type-adm', 'Administrativo',         'Mantenimiento de tarifarios, códigos, planes y convenios');
