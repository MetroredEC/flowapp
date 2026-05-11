CREATE TABLE IF NOT EXISTS task_events (
 id TEXT PRIMARY KEY,
 task_id TEXT NOT NULL,
 process_instance_id TEXT NOT NULL,
 request_id TEXT,
 action TEXT NOT NULL,
 comment TEXT,
 actor_id TEXT,
 actor_name TEXT,
 actor_email TEXT,
 created_at TEXT DEFAULT (datetime('now')),
 FOREIGN KEY (task_id) REFERENCES tasks(id),
 FOREIGN KEY (process_instance_id) REFERENCES process_instances(id)
);

CREATE INDEX IF NOT EXISTS idx_task_events_task ON task_events(task_id);
CREATE INDEX IF NOT EXISTS idx_task_events_instance ON task_events(process_instance_id);
