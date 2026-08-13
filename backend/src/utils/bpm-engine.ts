import { AppEnv } from '../types';

type Env = AppEnv['Bindings'];

type WorkflowNode = {
  id: string;
  type: 'start' | 'task' | 'decision' | 'end' | string;
  label: string;
  config_json?: string | null;
};

type WorkflowEdge = {
  target_node_id: string;
  condition_json?: string | null;
};

type ProcessInstanceData = {
  data_json?: string | null;
};

type TaskRow = {
  id: string;
  process_instance_id: string;
  request_id?: string | null;
  node_id?: string | null;
  title: string;
  assignee_email?: string | null;
  status: string;
};

type InstanceRow = {
  id: string;
  request_id?: string | null;
  data_json?: string | null;
};

type Condition = {
  field?: string;
  op?: '>' | '<' | '=' | '>=' | '<=' | '!=' | string;
  value?: unknown;
  action?: string;
};

export async function startProcessByKey(
  processKey: string,
  requestId: string,
  data: Record<string, unknown>,
  env: Env
): Promise<string> {
  const proc = await env.DB.prepare(`
    SELECT id
      FROM process_definitions
     WHERE key = ?
       AND status = 'active'
     ORDER BY version DESC
     LIMIT 1
  `).bind(processKey).first<{ id: string }>();

  if (!proc) {
    throw new Error('Process not found for key: ' + processKey);
  }

  return startProcess(proc.id, requestId, data, env);
}

export async function startProcess(
  processDefinitionId: string,
  requestId: string,
  data: Record<string, unknown>,
  env: Env
): Promise<string> {
  const db = env.DB;
  const instanceId = crypto.randomUUID();

  const startNode = await db.prepare(`
    SELECT id, type, label, config_json
      FROM workflow_nodes
     WHERE process_definition_id = ?
       AND type = 'start'
     LIMIT 1
  `).bind(processDefinitionId).first<WorkflowNode>();

  if (!startNode) {
    throw new Error('No start node');
  }

  await db.prepare(`
    INSERT INTO process_instances (
      id,
      process_definition_id,
      request_id,
      current_node_id,
      status,
      data_json
    )
    VALUES (?, ?, ?, ?, 'active', ?)
  `).bind(
    instanceId,
    processDefinitionId,
    requestId,
    startNode.id,
    JSON.stringify(data || {})
  ).run();

  await executeNode(instanceId, startNode.id, env);

  return instanceId;
}

export async function completeTask(
  taskId: string,
  action: string,
  comment: string,
  actor: { id: string; name: string; email: string },
  env: Env
): Promise<{ completed: boolean; nextNodeId?: string | null }> {
  const db = env.DB;

  const task = await db.prepare(`
    SELECT *
      FROM tasks
     WHERE id = ?
  `).bind(taskId).first<TaskRow>();

  if (!task) {
    throw new Error('Task not found');
  }

  if (task.status !== 'pending') {
    throw new Error('Task already completed');
  }

  const instance = await db.prepare(`
    SELECT id, request_id, data_json
      FROM process_instances
     WHERE id = ?
  `).bind(task.process_instance_id).first<InstanceRow>();

  if (!instance) {
    throw new Error('Process instance not found');
  }

  await db.prepare(`
    INSERT INTO task_events (
      id,
      task_id,
      process_instance_id,
      request_id,
      action,
      comment,
      actor_id,
      actor_name,
      actor_email
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    crypto.randomUUID(),
    task.id,
    task.process_instance_id,
    instance.request_id ?? task.request_id ?? null,
    action,
    normalizeComment(comment),
    actor.id,
    actor.name,
    actor.email
  ).run();

  await db.prepare(`
    UPDATE tasks
       SET status = 'completed',
           completed_at = datetime('now')
     WHERE id = ?
  `).bind(task.id).run();

  const nextEdge = await findNextEdgeFromTask(
    task.node_id ?? '',
    action,
    instance.data_json,
    env
  );

  if (!nextEdge) {
    await db.prepare(`
      UPDATE process_instances
         SET status = 'completed',
             completed_at = datetime('now')
       WHERE id = ?
    `).bind(instance.id).run();

    return {
      completed: true,
      nextNodeId: null,
    };
  }

  await db.prepare(`
    UPDATE process_instances
       SET current_node_id = ?
     WHERE id = ?
  `).bind(
    nextEdge.target_node_id,
    instance.id
  ).run();

  await executeNode(
    instance.id,
    nextEdge.target_node_id,
    env
  );

  return {
    completed: true,
    nextNodeId: nextEdge.target_node_id,
  };
}

export async function executeNode(
  instanceId: string,
  nodeId: string,
  env: Env
): Promise<void> {
  const db = env.DB;

  const node = await db.prepare(`
    SELECT id, type, label, config_json
      FROM workflow_nodes
     WHERE id = ?
  `).bind(nodeId).first<WorkflowNode>();

  if (!node) {
    throw new Error('Node not found');
  }

  switch (node.type) {
    case 'start':
      await moveNext(instanceId, nodeId, env);
      return;

    case 'task': {
      const config = safeJson<{
        assign?: {
          type?: string;
          value?: string;
        };
      }>(node.config_json, {});

      const instance = await db.prepare(`
        SELECT request_id, data_json
          FROM process_instances
         WHERE id = ?
      `).bind(instanceId).first<{
        request_id?: string | null;
        data_json?: string | null;
      }>();

      const processData = safeJson<Record<string, unknown>>(
        instance?.data_json,
        {}
      );

      let assigneeEmail: string | null = null;

      if (config.assign?.type === 'email') {
        assigneeEmail = config.assign.value ?? null;
      }

      if (config.assign?.type === 'requester') {
        const request = await db.prepare(`
          SELECT requester_email
            FROM requests
           WHERE id = ?
        `).bind(
          instance?.request_id ?? ''
        ).first<{ requester_email?: string | null }>();

        assigneeEmail = request?.requester_email ?? null;
      }

      const isReceiptTask =
        node.label.toLowerCase().includes('recep');

      const isDispatchTask =
        node.label.toLowerCase().includes('despach');

      await db.prepare(`
        INSERT INTO tasks (
          id,
          process_instance_id,
          request_id,
          node_id,
          title,
          assignee_email,
          status,
          payload_json
        )
        VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
      `).bind(
        crypto.randomUUID(),
        instanceId,
        instance?.request_id ?? null,
        node.id,
        node.label,
        assigneeEmail,
        JSON.stringify({
          node_id: node.id,
          node_label: node.label,
          requires_receipt: isReceiptTask,
          requires_dispatch: isDispatchTask,
          process_data: processData,
        })
      ).run();

      return;
    }

    case 'decision':
      await evaluateDecision(instanceId, nodeId, env);
      return;

    case 'end':
      await db.prepare(`
        UPDATE process_instances
           SET status = 'completed',
               completed_at = datetime('now')
         WHERE id = ?
      `).bind(instanceId).run();
      return;

    default:
      throw new Error('Unknown node type: ' + node.type);
  }
}

async function moveNext(
  instanceId: string,
  nodeId: string,
  env: Env
): Promise<void> {
  const edge = await env.DB.prepare(`
    SELECT target_node_id, condition_json
      FROM workflow_edges
     WHERE source_node_id = ?
     LIMIT 1
  `).bind(nodeId).first<WorkflowEdge>();

  if (!edge) {
    return;
  }

  await env.DB.prepare(`
    UPDATE process_instances
       SET current_node_id = ?
     WHERE id = ?
  `).bind(
    edge.target_node_id,
    instanceId
  ).run();

  await executeNode(
    instanceId,
    edge.target_node_id,
    env
  );
}

async function findNextEdgeFromTask(
  nodeId: string,
  action: string,
  dataJson: string | null | undefined,
  env: Env
): Promise<WorkflowEdge | null> {
  if (!nodeId) {
    return null;
  }

  const data = safeJson<Record<string, unknown>>(
    dataJson,
    {}
  );

  const edges = await env.DB.prepare(`
    SELECT target_node_id, condition_json
      FROM workflow_edges
     WHERE source_node_id = ?
  `).bind(nodeId).all<WorkflowEdge>();

  const all = edges.results ?? [];

  const actionEdges = all.filter(edge => {
    const cond = safeJson<Condition>(
      edge.condition_json,
      {}
    );

    return cond.action === action;
  });

  for (const edge of actionEdges.length ? actionEdges : all) {
    const cond = safeJson<Condition>(
      edge.condition_json,
      {}
    );

    if (evaluate(cond, data, action)) {
      return edge;
    }
  }

  return null;
}

async function evaluateDecision(
  instanceId: string,
  nodeId: string,
  env: Env
): Promise<void> {
  const db = env.DB;

  const instance = await db.prepare(`
    SELECT data_json
      FROM process_instances
     WHERE id = ?
  `).bind(instanceId).first<ProcessInstanceData>();

  if (!instance) {
    throw new Error('Process instance not found');
  }

  const data = safeJson<Record<string, unknown>>(
    instance.data_json,
    {}
  );

  const edges = await db.prepare(`
    SELECT target_node_id, condition_json
      FROM workflow_edges
     WHERE source_node_id = ?
  `).bind(nodeId).all<WorkflowEdge>();

  for (const edge of edges.results ?? []) {
    const cond = safeJson<Condition>(
      edge.condition_json,
      {}
    );

    if (evaluate(cond, data)) {
      await db.prepare(`
        UPDATE process_instances
           SET current_node_id = ?
         WHERE id = ?
      `).bind(
        edge.target_node_id,
        instanceId
      ).run();

      await executeNode(
        instanceId,
        edge.target_node_id,
        env
      );

      return;
    }
  }
}

function evaluate(
  cond: Condition,
  data: Record<string, unknown>,
  action?: string
): boolean {
  if (cond.action && action && cond.action !== action) {
    return false;
  }

  if (cond.action && !action) {
    return false;
  }

  if (!cond.field) {
    return true;
  }

  const value = data[cond.field];

  switch (cond.op) {
    case '>':
      return Number(value) > Number(cond.value);

    case '<':
      return Number(value) < Number(cond.value);

    case '>=':
      return Number(value) >= Number(cond.value);

    case '<=':
      return Number(value) <= Number(cond.value);

    case '=':
      return String(value) === String(cond.value);

    case '!=':
      return String(value) !== String(cond.value);

    default:
      return false;
  }
}

function normalizeComment(comment: string): string {
  return comment.trim().slice(0, 1200);
}

function safeJson<T>(
  value: string | null | undefined,
  fallback: T
): T {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
