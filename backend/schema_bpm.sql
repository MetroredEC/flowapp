CREATE TABLE IF NOT EXISTS process_definitions (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft',
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS workflow_nodes (
  id TEXT PRIMARY KEY,
  process_definition_id TEXT NOT NULL,
  node_key TEXT NOT NULL,
  type TEXT NOT NULL,
  label TEXT NOT NULL,
  config_json TEXT,
  position_x INTEGER DEFAULT 0,
  position_y INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (process_definition_id) REFERENCES process_definitions(id)
);

CREATE TABLE IF NOT EXISTS workflow_edges (
  id TEXT PRIMARY KEY,
  process_definition_id TEXT NOT NULL,
  source_node_id TEXT NOT NULL,
  target_node_id TEXT NOT NULL,
  condition_json TEXT,
  label TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (process_definition_id) REFERENCES process_definitions(id),
  FOREIGN KEY (source_node_id) REFERENCES workflow_nodes(id),
  FOREIGN KEY (target_node_id) REFERENCES workflow_nodes(id)
);

CREATE TABLE IF NOT EXISTS form_definitions (
  id TEXT PRIMARY KEY,
  process_definition_id TEXT NOT NULL,
  name TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (process_definition_id) REFERENCES process_definitions(id)
);

CREATE TABLE IF NOT EXISTS form_fields (
  id TEXT PRIMARY KEY,
  form_definition_id TEXT NOT NULL,
  field_key TEXT NOT NULL,
  label TEXT NOT NULL,
  type TEXT NOT NULL,
  required INTEGER DEFAULT 0,
  options_json TEXT,
  default_value TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (form_definition_id) REFERENCES form_definitions(id)
);

CREATE TABLE IF NOT EXISTS process_instances (
  id TEXT PRIMARY KEY,
  process_definition_id TEXT NOT NULL,
  request_id TEXT,
  status TEXT NOT NULL DEFAULT 'running',
  current_node_id TEXT,
  started_by TEXT,
  started_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT,
  data_json TEXT,
  FOREIGN KEY (process_definition_id) REFERENCES process_definitions(id)
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  process_instance_id TEXT NOT NULL,
  request_id TEXT,
  node_id TEXT,
  title TEXT NOT NULL,
  assignee_user_id TEXT,
  assignee_email TEXT,
  assignee_role TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  due_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT,
  FOREIGN KEY (process_instance_id) REFERENCES process_instances(id)
);

CREATE TABLE IF NOT EXISTS task_actions (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  action_key TEXT NOT NULL,
  label TEXT NOT NULL,
  next_node_id TEXT,
  requires_comment INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (task_id) REFERENCES tasks(id)
);

CREATE TABLE IF NOT EXISTS automation_rules (
  id TEXT PRIMARY KEY,
  process_definition_id TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  config_json TEXT NOT NULL,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (process_definition_id) REFERENCES process_definitions(id)
);

CREATE INDEX IF NOT EXISTS idx_workflow_nodes_process ON workflow_nodes(process_definition_id);
CREATE INDEX IF NOT EXISTS idx_workflow_edges_process ON workflow_edges(process_definition_id);
CREATE INDEX IF NOT EXISTS idx_process_instances_status ON process_instances(status);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee_email ON tasks(assignee_email);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
