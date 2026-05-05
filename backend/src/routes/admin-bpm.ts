import { Hono } from 'hono';
import { AppEnv } from '../types';

const router = new Hono<AppEnv>();

// =========================
// Crear proceso
// =========================
router.post('/process', async (c) => {
  const body = await c.req.json();

  const id = crypto.randomUUID();

  await c.env.DB.prepare(`
    INSERT INTO process_definitions (id, key, name, description, status)
    VALUES (?, ?, ?, ?, 'draft')
  `).bind(id, body.key, body.name, body.description || '').run();

  return c.json({ id });
});

// =========================
// Crear nodo
// =========================
router.post('/node', async (c) => {
  const body = await c.req.json();

  const id = crypto.randomUUID();

  await c.env.DB.prepare(`
    INSERT INTO workflow_nodes (id, process_definition_id, node_key, type, label, config_json)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    body.processId,
    body.key,
    body.type,
    body.label,
    JSON.stringify(body.config || {})
  ).run();

  return c.json({ id });
});

// =========================
// Crear conexión
// =========================
router.post('/edge', async (c) => {
  const body = await c.req.json();

  const id = crypto.randomUUID();

  await c.env.DB.prepare(`
    INSERT INTO workflow_edges (id, process_definition_id, source_node_id, target_node_id, condition_json)
    VALUES (?, ?, ?, ?, ?)
  `).bind(
    id,
    body.processId,
    body.from,
    body.to,
    JSON.stringify(body.condition || {})
  ).run();

  return c.json({ id });
});

// =========================
// Crear formulario
// =========================
router.post('/form', async (c) => {
  const body = await c.req.json();

  const id = crypto.randomUUID();

  await c.env.DB.prepare(`
    INSERT INTO form_definitions (id, process_definition_id, name)
    VALUES (?, ?, ?)
  `).bind(id, body.processId, body.name).run();

  return c.json({ id });
});

// =========================
// Crear campo
// =========================
router.post('/field', async (c) => {
  const body = await c.req.json();

  const id = crypto.randomUUID();

  await c.env.DB.prepare(`
    INSERT INTO form_fields (id, form_definition_id, field_key, label, type, required, options_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    body.formId,
    body.key,
    body.label,
    body.type,
    body.required ? 1 : 0,
    JSON.stringify(body.options || {})
  ).run();

  return c.json({ id });
});

export default router;
