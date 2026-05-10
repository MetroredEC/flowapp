import { Hono } from 'hono';
import { AppEnv } from '../types';

const router = new Hono<AppEnv>();

router.get('/blueprints', async (c) => {
  const rows = await c.env.DB.prepare(`
    SELECT *
      FROM process_blueprints
     ORDER BY created_at DESC
  `).all();

  return c.json({
    data: rows.results || [],
  });
});

router.post('/blueprints', async (c) => {
  const body = await c.req.json();

  const id = crypto.randomUUID();

  await c.env.DB.prepare(`
    INSERT INTO process_blueprints (
      id,
      name,
      source_text,
      status,
      created_at
    )
    VALUES (?, ?, ?, 'draft', datetime('now'))
  `).bind(
    id,
    body.name || 'Proceso',
    body.source_text || ''
  ).run();

  return c.json({
    data: { id },
  });
});

router.post('/blueprints/:id/analyze', async (c) => {
  const id = c.req.param('id');

  const blueprint = await c.env.DB.prepare(`
    SELECT *
      FROM process_blueprints
     WHERE id = ?
  `).bind(id).first<{ id: string; name: string; source_text?: string | null }>();

  if (!blueprint) {
    return c.json({ error: 'not_found' }, 404);
  }

  const proposal = {
    steps: [
      { id: 'solicitud', label: 'Solicitud', approver_role: 'SUPERVISOR' },
      { id: 'compras', label: 'Compras', approver_role: 'COMPRAS' },
      { id: 'contabilidad', label: 'Contabilidad', approver_role: 'CONTABILIDAD' },
      { id: 'recepcion', label: 'Recepción', approver_role: 'SUPERVISOR' },
    ],
  };

  await c.env.DB.prepare(`
    UPDATE process_blueprints
       SET proposed_process_json = ?,
           status = 'analyzed'
     WHERE id = ?
  `).bind(
    JSON.stringify(proposal, null, 2),
    id
  ).run();

  return c.json({ success: true });
});

router.post('/blueprints/:id/deploy', async (c) => {
  const id = c.req.param('id');

  const blueprint = await c.env.DB.prepare(`
    SELECT *
      FROM process_blueprints
     WHERE id = ?
  `).bind(id).first<{
    id: string;
    name: string;
    proposed_process_json?: string | null;
  }>();

  if (!blueprint) {
    return c.json({ error: 'not_found' }, 404);
  }

  const processDefinitionId = crypto.randomUUID();

  await c.env.DB.prepare(`
    INSERT INTO process_definitions (
      id,
      key,
      name,
      version,
      status
    )
    VALUES (?, ?, ?, 1, 'active')
  `).bind(
    processDefinitionId,
    blueprint.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    blueprint.name
  ).run();

  const parsed = JSON.parse(blueprint.proposed_process_json || '{"steps":[]}') as {
    steps?: Array<{ id: string; label: string; approver_role?: string }>;
  };

  let previousNodeId = '';

  const startNodeId = crypto.randomUUID();

  await c.env.DB.prepare(`
    INSERT INTO workflow_nodes (
      id,
      process_definition_id,
      node_key,
      type,
      label,
      config_json
    )
    VALUES (?, ?, 'start', 'start', 'Inicio', NULL)
  `).bind(
    startNodeId,
    processDefinitionId
  ).run();

  previousNodeId = startNodeId;

  for (const step of parsed.steps || []) {
    const nodeId = crypto.randomUUID();

    await c.env.DB.prepare(`
      INSERT INTO workflow_nodes (
        id,
        process_definition_id,
        node_key,
        type,
        label,
        config_json
      )
      VALUES (?, ?, ?, 'task', ?, ?)
    `).bind(
      nodeId,
      processDefinitionId,
      step.id,
      step.label,
      JSON.stringify(step)
    ).run();

    await c.env.DB.prepare(`
      INSERT INTO workflow_edges (
        id,
        process_definition_id,
        source_node_id,
        target_node_id,
        label
      )
      VALUES (?, ?, ?, ?, 'Continuar')
    `).bind(
      crypto.randomUUID(),
      processDefinitionId,
      previousNodeId,
      nodeId
    ).run();

    previousNodeId = nodeId;
  }

  const endNodeId = crypto.randomUUID();

  await c.env.DB.prepare(`
    INSERT INTO workflow_nodes (
      id,
      process_definition_id,
      node_key,
      type,
      label,
      config_json
    )
    VALUES (?, ?, 'end', 'end', 'Fin', NULL)
  `).bind(
    endNodeId,
    processDefinitionId
  ).run();

  await c.env.DB.prepare(`
    INSERT INTO workflow_edges (
      id,
      process_definition_id,
      source_node_id,
      target_node_id,
      label
    )
    VALUES (?, ?, ?, ?, 'Finalizar')
  `).bind(
    crypto.randomUUID(),
    processDefinitionId,
    previousNodeId,
    endNodeId
  ).run();

  await c.env.DB.prepare(`
    UPDATE process_blueprints
       SET status = 'deployed'
     WHERE id = ?
  `).bind(id).run();

  return c.json({
    success: true,
    process_definition_id: processDefinitionId,
  });
});

export default router;
