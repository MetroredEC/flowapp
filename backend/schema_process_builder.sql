CREATE TABLE IF NOT EXISTS process_form_schemas (
  id TEXT PRIMARY KEY,
  process_definition_id TEXT NOT NULL,
  node_id TEXT,
  form_key TEXT NOT NULL,
  form_name TEXT NOT NULL,
  schema_json TEXT NOT NULL,
  validation_json TEXT,
  attachment_rules_json TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY(process_definition_id)
    REFERENCES process_definitions(id),

  FOREIGN KEY(node_id)
    REFERENCES workflow_nodes(id)
);

CREATE TABLE IF NOT EXISTS process_form_submissions (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  task_id TEXT,
  form_schema_id TEXT NOT NULL,
  submitted_by_email TEXT NOT NULL,
  values_json TEXT NOT NULL,
  attachments_json TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY(request_id)
    REFERENCES requests(id),

  FOREIGN KEY(task_id)
    REFERENCES tasks(id),

  FOREIGN KEY(form_schema_id)
    REFERENCES process_form_schemas(id)
);

CREATE TABLE IF NOT EXISTS process_blueprints (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  source_text TEXT,
  source_attachment_id TEXT,
  ai_analysis_json TEXT,
  proposed_process_json TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  created_by_email TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
