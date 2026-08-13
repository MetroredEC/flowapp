import { Hono } from 'hono';
import { AppEnv } from '../types';

const router = new Hono<AppEnv>();

router.get('/blueprints', async (c) => {

  const result = await c.env.DB.prepare(`
    SELECT *
    FROM process_blueprints
    ORDER BY created_at DESC
  `).all();

  return c.json({ data: result.results || [] });

});

router.post('/blueprints', async (c) => {

  const body = await c.req.json();

  const id = crypto.randomUUID();

  await c.env.DB.prepare(`
    INSERT INTO process_blueprints (
      id,
      name,
      description,
      source_text,
      status,
      created_by_email
    )
    VALUES (?, ?, ?, ?, 'draft', ?)
  `).bind(
    id,
    body.name || 'Nuevo proceso',
    body.description || '',
    body.source_text || '',
    c.get('userEmail')
  ).run();

  return c.json({
    data: {
      id
    }
  });

});

router.post('/blueprints/:id/analyze', async (c) => {

  const id = c.req.param('id');

  const blueprint = await c.env.DB.prepare(`
    SELECT *
    FROM process_blueprints
    WHERE id = ?
  `).bind(id).first<any>();

  if (!blueprint) {
    return c.json({ error: 'not_found' }, 404);
  }

  const source = String(blueprint.source_text || '');

  const lower = source.toLowerCase();

  const steps = [];

  if (lower.includes('solic')) {
    steps.push({
      id: 'start',
      type: 'start',
      label: 'Solicitud'
    });
  }

  if (lower.includes('compr')) {
    steps.push({
      id: 'compras',
      type: 'approval',
      label: 'Compras'
    });
  }

  if (lower.includes('contab') || lower.includes('presupuesto')) {
    steps.push({
      id: 'contabilidad',
      type: 'approval',
      label: 'Contabilidad'
    });
  }

  if (lower.includes('despach')) {
    steps.push({
      id: 'despacho',
      type: 'task',
      label: 'Despacho'
    });
  }

  if (lower.includes('recep')) {
    steps.push({
      id: 'recepcion',
      type: 'task',
      label: 'Recepción'
    });
  }

  steps.push({
    id: 'end',
    type: 'end',
    label: 'Fin'
  });

  const proposal = {
    process_key: blueprint.name
      .toLowerCase()
      .replaceAll(' ', '_'),
    process_name: blueprint.name,
    version: 1,
    nodes: steps,
    generated_by_ai: true
  };

  await c.env.DB.prepare(`
    UPDATE process_blueprints
       SET ai_analysis_json = ?,
           proposed_process_json = ?,
           updated_at = CURRENT_TIMESTAMP
     WHERE id = ?
  `).bind(
    JSON.stringify({
      summary: 'Proceso analizado automáticamente',
      detected_steps: steps.length
    }),
    JSON.stringify(proposal),
    id
  ).run();

  return c.json({
    data: proposal
  });

});

router.post('/blueprints/:id/deploy', async (c) => {

  const id = c.req.param('id');

  const blueprint = await c.env.DB.prepare(`
    SELECT *
    FROM process_blueprints
    WHERE id = ?
  `).bind(id).first<any>();

  if (!blueprint) {
    return c.json({ error: 'not_found' }, 404);
  }

  const process = JSON.parse(
    blueprint.proposed_process_json || '{}'
  );

  const processId = crypto.randomUUID();

  await c.env.DB.prepare(`
    INSERT INTO process_definitions (
      id,
      process_key,
      name,
      version,
      status
    )
    VALUES (?, ?, ?, ?, 'active')
  `).bind(
    processId,
    process.process_key,
    process.process_name,
    process.version || 1
  ).run();

  for (const node of process.nodes || []) {

    await c.env.DB.prepare(`
      INSERT INTO workflow_nodes (
        id,
        process_definition_id,
        node_key,
        node_type,
        name,
        config_json
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      crypto.randomUUID(),
      processId,
      node.id,
      node.type,
      node.label,
      JSON.stringify(node)
    ).run();

  }

  await c.env.DB.prepare(`
    UPDATE process_blueprints
       SET status = 'deployed',
           updated_at = CURRENT_TIMESTAMP
     WHERE id = ?
  `).bind(id).run();

  return c.json({
    data: {
      deployed: true,
      process_definition_id: processId
    }
  });

});

export default router;
