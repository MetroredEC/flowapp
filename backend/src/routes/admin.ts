import { Hono } from 'hono';
import { AppEnv } from '../types';
import { getAppToken, searchUsers, sendMail } from '../utils/graph';
import { appUrl, sendTeamsCard } from '../utils/teams';
import { logEvent, newTraceId } from '../utils/syslog';

const router = new Hono<AppEnv>();

// La configuración de procesos es administrativa. Los usuarios autenticados
// solo necesitan leer tipos y campos para completar una nueva solicitud.
router.use('*', async (c, next) => {
  const path = c.req.path;
  const publicRead = c.req.method === 'GET' && (
    path.endsWith('/request-types') || path.includes('/form-fields/')
  );
  if (publicRead) return next();
  const roles = c.get('userRoles') ?? [];
  if (!roles.includes('flowapp-admin')) {
    return c.json({ error: 'forbidden', message: 'Se requiere el rol flowapp-admin' }, 403);
  }
  return next();
});

// ─── Tipos de solicitud ───────────────────────────────────────────────────────
router.get('/request-types', async (c) => {
  const rows = await c.env.DB.prepare('SELECT * FROM request_types ORDER BY name').all();
  return c.json({ data: rows.results });
});

router.post('/request-types', async (c) => {
  const { name, description } = await c.req.json<{ name: string; description?: string }>();
  if (!name?.trim()) return c.json({ error: 'name requerido' }, 400);
  const id = crypto.randomUUID().slice(0, 8);
  await c.env.DB.prepare('INSERT INTO request_types (id, name, description) VALUES (?, ?, ?)')
    .bind(id, name.trim(), description ?? null).run();
  return c.json({ data: { id } }, 201);
});

router.patch('/request-types/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{ name?: string; description?: string; is_active?: number }>();
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (body.name !== undefined)      { sets.push('name = ?');        vals.push(body.name); }
  if (body.description !== undefined){ sets.push('description = ?'); vals.push(body.description); }
  if (body.is_active !== undefined)  { sets.push('is_active = ?');   vals.push(body.is_active); }
  if (!sets.length) return c.json({ error: 'nada que actualizar' }, 400);
  vals.push(id);
  await c.env.DB.prepare(`UPDATE request_types SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
  return c.json({ data: { updated: true } });
});

// ─── Configuración de flujos ──────────────────────────────────────────────────
router.get('/flows/:typeId', async (c) => {
  const rows = await c.env.DB.prepare(
    'SELECT * FROM flow_configs WHERE request_type_id = ? ORDER BY level'
  ).bind(c.req.param('typeId')).all();
  return c.json({ data: rows.results });
});

router.put('/flows/:typeId', async (c) => {
  const typeId = c.req.param('typeId');
  const levels = await c.req.json<Array<{
    level: number; label: string;
    approver_type: 'fixed_user' | 'job_title';
    approver_value: string; approver_name?: string; approver_email?: string;
  }>>();

  if (!Array.isArray(levels) || levels.length === 0 || levels.length > 4) {
    return c.json({ error: 'Se requieren entre 1 y 4 niveles' }, 400);
  }

  // Borrar configuración actual y reemplazar (transacción)
  const stmts = [
    c.env.DB.prepare('DELETE FROM flow_configs WHERE request_type_id = ?').bind(typeId),
    ...levels.map(l =>
      c.env.DB.prepare(`
        INSERT INTO flow_configs
          (id, request_type_id, level, label, approver_type, approver_value, approver_name, approver_email)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        crypto.randomUUID().slice(0, 8), typeId, l.level, l.label,
        l.approver_type, l.approver_value,
        l.approver_name ?? null, l.approver_email ?? null
      )
    ),
  ];
  await c.env.DB.batch(stmts);
  return c.json({ data: { saved: levels.length } });
});

// ─── Buscador de usuarios Entra ID ───────────────────────────────────────────
router.get('/users/search', async (c) => {
  const q = c.req.query('q') ?? '';
  if (q.length < 2) return c.json({ data: [] });
  const startedAt = Date.now();
  try {
    const token = await getAppToken(
      c.env.ENTRA_TENANT_ID, c.env.ENTRA_CLIENT_ID, c.env.ENTRA_CLIENT_SECRET, c.env.KV
    );
    const users = await searchUsers(q, token);
    await logEvent(c.env.DB, {
      category: 'auth', action: 'graph_user_search', trace_id: c.get('traceId'), source: 'admin',
      actor: c.get('userEmail'), duration_ms: Date.now() - startedAt,
      detail: { query: q, results: users.length },
    });
    return c.json({
      data: users.map(u => ({
        id: u.id, name: u.displayName, email: u.mail ?? u.userPrincipalName,
        jobTitle: u.jobTitle ?? '', department: u.department ?? '',
      }))
    });
  } catch (error) {
    await logEvent(c.env.DB, {
      category: 'auth', action: 'graph_user_search_failed', ok: false, trace_id: c.get('traceId'),
      source: 'admin', actor: c.get('userEmail'), duration_ms: Date.now() - startedAt,
      detail: { query: q, error: error instanceof Error ? error.message : String(error) },
    });
    throw error;
  }
});

// ─── Dashboard stats ──────────────────────────────────────────────────────────
router.get('/stats', async (c) => {
  const [totals, byStatus, byType] = await Promise.all([
    c.env.DB.prepare('SELECT COUNT(*) as total FROM requests').first<{ total: number }>(),
    c.env.DB.prepare('SELECT status, COUNT(*) as count FROM requests GROUP BY status').all(),
    c.env.DB.prepare('SELECT request_type_name, COUNT(*) as count FROM requests GROUP BY request_type_name').all(),
  ]);
  return c.json({ data: { totals, byStatus: byStatus.results, byType: byType.results } });
});

// ─── Lista de todas las solicitudes (admin) ───────────────────────────────────
router.get('/requests', async (c) => {
  const { status, type, q, page = '1' } = c.req.query();
  const limit = 50;
  const offset = (parseInt(page) - 1) * limit;

  let sql = 'SELECT * FROM requests WHERE 1=1';
  const params: unknown[] = [];
  if (status) { sql += ' AND status = ?'; params.push(status); }
  if (type)   { sql += ' AND request_type_id = ?'; params.push(type); }
  if (q)      { sql += ' AND (title LIKE ? OR requester_name LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
  sql += ` ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;

  const rows = await c.env.DB.prepare(sql).bind(...params).all();
  return c.json({ data: rows.results });
});

// ─── Process Builder: listar procesos con sus flujos ─────────────────────────
router.get('/processes', async (c) => {
  const types = await c.env.DB.prepare(
    `SELECT rt.id, rt.name, rt.description, rt.is_active, rt.created_at,
            (SELECT COUNT(*) FROM requests r WHERE r.request_type_id = rt.id) AS request_count
     FROM request_types rt
     ORDER BY rt.name`
  ).all<{ id: string; name: string; description: string | null; is_active: number; created_at: string; request_count: number }>();

  const flows = await c.env.DB.prepare(
    'SELECT * FROM flow_configs ORDER BY request_type_id, level'
  ).all<{
    id: string; request_type_id: string; level: number; label: string;
    approver_type: string; approver_value: string; approver_name: string | null; approver_email: string | null;
  }>();

  const flowMap: Record<string, typeof flows.results> = {};
  for (const f of flows.results ?? []) {
    if (!flowMap[f.request_type_id]) flowMap[f.request_type_id] = [];
    flowMap[f.request_type_id].push(f);
  }

  const data = (types.results ?? []).map(t => ({
    ...t,
    levels: flowMap[t.id] ?? [],
  }));

  return c.json({ data });
});

// ─── Process Builder: crear proceso completo (tipo + flujo) en un paso ────────
router.post('/processes', async (c) => {
  const body = await c.req.json<{
    name: string;
    description?: string;
    levels: Array<{
      level: number; label: string;
      approver_type: 'fixed_user' | 'job_title';
      approver_value: string; approver_name?: string; approver_email?: string;
    }>;
  }>();

  if (!body.name?.trim()) return c.json({ error: 'name requerido' }, 400);
  if (!Array.isArray(body.levels) || body.levels.length === 0 || body.levels.length > 4) {
    return c.json({ error: 'Se requieren entre 1 y 4 niveles' }, 400);
  }

  const typeId = crypto.randomUUID().slice(0, 8);

  const stmts = [
    c.env.DB.prepare(
      'INSERT INTO request_types (id, name, description) VALUES (?, ?, ?)'
    ).bind(typeId, body.name.trim(), body.description?.trim() ?? null),

    ...body.levels.map(l =>
      c.env.DB.prepare(`
        INSERT INTO flow_configs
          (id, request_type_id, level, label, approver_type, approver_value, approver_name, approver_email)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        crypto.randomUUID().slice(0, 8), typeId, l.level, l.label,
        l.approver_type, l.approver_value,
        l.approver_name ?? null, l.approver_email ?? null
      )
    ),
  ];

  await c.env.DB.batch(stmts);
  return c.json({ data: { id: typeId, name: body.name.trim() } }, 201);
});

// Guardado atómico del wizard: identidad, flujo, formulario y correo se
// confirman juntos. Si una sentencia falla, D1 revierte el lote completo.
router.post('/processes/full', async (c) => {
  const body = await c.req.json<{
    id?: string; name: string; description?: string;
    levels: Array<{
      level: number; label: string; approver_type: 'fixed_user' | 'job_title';
      approver_value: string; approver_name?: string; approver_email?: string;
    }>;
    fields: Array<{
      field_key: string; label: string; field_type: string; placeholder?: string;
      required?: number; options_json?: string; sort_order?: number;
    }>;
    form_schema_json: string; email_subject: string; email_body: string;
    color: string; icon: string; category?: string; default_sla_days?: number;
    workspace_id?: string;
    assignment_mode?: 'auto_load' | 'manual' | 'fixed_user';
    fixed_assignee_id?: string; fixed_assignee_name?: string; fixed_assignee_email?: string;
    execution_sla_days?: number;
    checklist_json?: string; deliverables_json?: string;
    require_requester_confirmation?: number;
  }>();

  const name = body.name?.trim();
  if (!name || name.length < 2 || name.length > 120) {
    return c.json({ error: 'validation_error', message: 'El nombre debe tener entre 2 y 120 caracteres' }, 400);
  }
  if (!Array.isArray(body.levels) || body.levels.length < 1 || body.levels.length > 4) {
    return c.json({ error: 'validation_error', message: 'El flujo debe tener entre 1 y 4 niveles' }, 400);
  }
  for (const [index, level] of body.levels.entries()) {
    if (!level.label?.trim()) return c.json({ error: 'validation_error', message: `Falta el nombre del nivel ${index + 1}` }, 400);
    if (!level.approver_value?.trim()) return c.json({ error: 'validation_error', message: `Falta el aprobador del nivel ${index + 1}` }, 400);
    if (level.approver_type === 'fixed_user' && !level.approver_email?.trim()) {
      return c.json({ error: 'validation_error', message: `El aprobador del nivel ${index + 1} no tiene correo` }, 400);
    }
  }
  if (!Array.isArray(body.fields)) return c.json({ error: 'validation_error', message: 'El formulario no es válido' }, 400);
  const allowedFieldTypes = new Set([
    'text', 'email', 'textarea', 'number', 'date', 'select', 'checkbox',
    'radio', 'checkbox_group', 'file', 'section',
  ]);
  const fieldKeys = new Set<string>();
  for (const [index, field] of body.fields.entries()) {
    if (!field.field_key?.trim() || fieldKeys.has(field.field_key)) {
      return c.json({ error: 'validation_error', message: `La clave del campo ${index + 1} está vacía o repetida` }, 400);
    }
    if (!field.label?.trim()) return c.json({ error: 'validation_error', message: `Falta el texto de la pregunta ${index + 1}` }, 400);
    if (!allowedFieldTypes.has(field.field_type)) return c.json({ error: 'validation_error', message: `Tipo de campo no soportado: ${field.field_type}` }, 400);
    fieldKeys.add(field.field_key);
  }
  try {
    if (!Array.isArray(JSON.parse(body.form_schema_json))) throw new Error('schema');
  } catch {
    return c.json({ error: 'validation_error', message: 'La estructura visual del formulario no es válida' }, 400);
  }
  if (!body.email_subject?.trim() || !body.email_body?.trim()) {
    return c.json({ error: 'validation_error', message: 'El correo final necesita asunto y contenido' }, 400);
  }
  const defaultSlaDays = Math.round(Number(body.default_sla_days ?? 5));
  if (!Number.isFinite(defaultSlaDays) || defaultSlaDays < 1 || defaultSlaDays > 365) {
    return c.json({ error: 'validation_error', message: 'El SLA debe estar entre 1 y 365 días laborables' }, 400);
  }
  const assignmentMode = body.assignment_mode ?? 'auto_load';
  if (!['auto_load', 'manual', 'fixed_user'].includes(assignmentMode)) {
    return c.json({ error: 'validation_error', message: 'La modalidad de asignación no es válida' }, 400);
  }
  if (assignmentMode === 'fixed_user' && !body.fixed_assignee_email?.trim()) {
    return c.json({ error: 'validation_error', message: 'Selecciona la persona responsable fija' }, 400);
  }
  const executionSlaDays = Math.round(Number(body.execution_sla_days ?? defaultSlaDays));
  if (!Number.isFinite(executionSlaDays) || executionSlaDays < 1 || executionSlaDays > 365) {
    return c.json({ error: 'validation_error', message: 'El SLA de ejecución debe estar entre 1 y 365 días' }, 400);
  }
  let checklist: Array<{ id?: string; label: string; required?: boolean }> = [];
  let deliverables: Array<{ id?: string; label: string; required?: boolean }> = [];
  try {
    checklist = JSON.parse(body.checklist_json ?? '[]');
    deliverables = JSON.parse(body.deliverables_json ?? '[]');
    if (!Array.isArray(checklist) || !Array.isArray(deliverables)) throw new Error('schema');
  } catch {
    return c.json({ error: 'validation_error', message: 'El checklist o los entregables no son válidos' }, 400);
  }
  if (checklist.some(item => !item.label?.trim()) || deliverables.some(item => !item.label?.trim())) {
    return c.json({ error: 'validation_error', message: 'Todos los requisitos de ejecución deben tener nombre' }, 400);
  }
  if (checklist.length > 30 || deliverables.length > 20) {
    return c.json({ error: 'validation_error', message: 'El proceso excede el máximo de requisitos operativos' }, 400);
  }

  const editing = Boolean(body.id);
  const typeId = body.id || crypto.randomUUID().slice(0, 8);
  if (editing) {
    const exists = await c.env.DB.prepare('SELECT id FROM request_types WHERE id = ?').bind(typeId).first();
    if (!exists) return c.json({ error: 'not_found', message: 'El proceso que intentas editar ya no existe' }, 404);
  }
  const duplicate = await c.env.DB.prepare(
    'SELECT id FROM request_types WHERE lower(trim(name)) = lower(trim(?)) AND id <> ? LIMIT 1'
  ).bind(name, typeId).first();
  if (duplicate) return c.json({ error: 'duplicate_name', message: 'Ya existe un proceso con ese nombre' }, 409);

  const latestVersion = await c.env.DB.prepare(
    'SELECT MAX(version) AS version FROM process_versions WHERE process_id = ?'
  ).bind(typeId).first<{ version: number | null }>();
  const nextVersion = (latestVersion?.version ?? 0) + 1;
  const versionId = crypto.randomUUID();
  const snapshot = JSON.stringify({
    name, description: body.description?.trim() || null,
    levels: body.levels, fields: body.fields,
    form_schema_json: body.form_schema_json,
    email_subject: body.email_subject.trim(), email_body: body.email_body.trim(),
    color: body.color || '#0284C7', icon: body.icon || 'flow',
    category: body.category?.trim() || null, default_sla_days: defaultSlaDays,
    workspace_id: body.workspace_id?.trim() || null,
    assignment_mode: assignmentMode,
    fixed_assignee_id: body.fixed_assignee_id?.trim() || null,
    fixed_assignee_name: body.fixed_assignee_name?.trim() || null,
    fixed_assignee_email: body.fixed_assignee_email?.trim() || null,
    execution_sla_days: executionSlaDays,
    checklist, deliverables,
    require_requester_confirmation: body.require_requester_confirmation === 0 ? 0 : 1,
  });

  const statements: D1PreparedStatement[] = [];
  if (editing) {
    statements.push(c.env.DB.prepare(
      "UPDATE request_types SET name = ?, description = ? WHERE id = ?"
    ).bind(name, body.description?.trim() || null, typeId));
    statements.push(c.env.DB.prepare(
      "UPDATE requests SET request_type_name = ? WHERE request_type_id = ? AND status IN ('draft','pending','in_progress')"
    ).bind(name, typeId));
  } else {
    statements.push(c.env.DB.prepare(
      'INSERT INTO request_types (id, name, description) VALUES (?, ?, ?)'
    ).bind(typeId, name, body.description?.trim() || null));
  }

  statements.push(c.env.DB.prepare('DELETE FROM flow_configs WHERE request_type_id = ?').bind(typeId));
  for (const [index, level] of body.levels.entries()) {
    statements.push(c.env.DB.prepare(`
      INSERT INTO flow_configs
        (id, request_type_id, level, label, approver_type, approver_value, approver_name, approver_email)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      crypto.randomUUID().slice(0, 8), typeId, index + 1, level.label.trim(),
      level.approver_type, level.approver_value.trim(), level.approver_name?.trim() || null,
      level.approver_email?.trim() || null,
    ));
  }

  statements.push(c.env.DB.prepare('DELETE FROM request_type_fields WHERE request_type_id = ?').bind(typeId));
  for (const [index, field] of body.fields.entries()) {
    statements.push(c.env.DB.prepare(`
      INSERT INTO request_type_fields
        (id, request_type_id, field_key, label, field_type, placeholder, required, options_json, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      crypto.randomUUID().slice(0, 8), typeId, field.field_key.trim(), field.label.trim(),
      field.field_type, field.placeholder?.trim() || null, field.required ? 1 : 0,
      field.options_json || null, field.sort_order ?? index,
    ));
  }

  statements.push(c.env.DB.prepare(`
    INSERT INTO process_configs
      (id, form_schema_json, email_subject, email_body, color, icon, category, default_sla_days,
       workspace_id, assignment_mode, fixed_assignee_id, fixed_assignee_name, fixed_assignee_email,
       execution_sla_days, checklist_json, deliverables_json, require_requester_confirmation, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      form_schema_json = excluded.form_schema_json,
      email_subject = excluded.email_subject,
      email_body = excluded.email_body,
      color = excluded.color,
      icon = excluded.icon,
      category = excluded.category,
      default_sla_days = excluded.default_sla_days,
      workspace_id = excluded.workspace_id,
      assignment_mode = excluded.assignment_mode,
      fixed_assignee_id = excluded.fixed_assignee_id,
      fixed_assignee_name = excluded.fixed_assignee_name,
      fixed_assignee_email = excluded.fixed_assignee_email,
      execution_sla_days = excluded.execution_sla_days,
      checklist_json = excluded.checklist_json,
      deliverables_json = excluded.deliverables_json,
      require_requester_confirmation = excluded.require_requester_confirmation,
      updated_at = datetime('now')
  `).bind(
    typeId, body.form_schema_json, body.email_subject.trim(), body.email_body.trim(),
    body.color || '#0284C7', body.icon || 'flow', body.category?.trim() || null, defaultSlaDays,
    body.workspace_id?.trim() || null, assignmentMode,
    body.fixed_assignee_id?.trim() || null, body.fixed_assignee_name?.trim() || null,
    body.fixed_assignee_email?.trim() || null, executionSlaDays,
    JSON.stringify(checklist), JSON.stringify(deliverables), body.require_requester_confirmation === 0 ? 0 : 1,
  ));
  statements.push(c.env.DB.prepare(`
    INSERT INTO process_versions
      (id, process_id, version, name, description, snapshot_json, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    versionId, typeId, nextVersion, name, body.description?.trim() || null,
    snapshot, c.get('userEmail'),
  ));

  await c.env.DB.batch(statements);
  await logEvent(c.env.DB, {
    category: 'config', action: editing ? 'process_updated' : 'process_created',
    trace_id: c.get('traceId'), source: 'process-wizard', ref_type: 'process', ref_id: typeId,
    actor: c.get('userEmail'), detail: {
      name, levels: body.levels.length, fields: body.fields.length, version: nextVersion,
      sla_days: defaultSlaDays, workspace_id: body.workspace_id, assignment_mode: assignmentMode,
      checklist: checklist.length, deliverables: deliverables.length,
    },
  });
  return c.json({ data: { id: typeId, name, edited: editing, version: nextVersion } }, editing ? 200 : 201);
});

// ─── Registro del sistema (sys_events) ────────────────────────────────────────
router.get('/logs', async (c) => {
  const roles = c.get('userRoles') ?? [];
  if (!roles.includes('flowapp-admin')) {
    return c.json({ error: 'forbidden', message: 'Solo administradores' }, 403);
  }
  const category = c.req.query('category');
  const trace = c.req.query('trace')?.trim();
  const search = c.req.query('q')?.trim();
  const onlyErrors = c.req.query('errors') === '1';
  const limit = Math.min(parseInt(c.req.query('limit') ?? '120', 10) || 120, 300);

  let q = 'SELECT * FROM sys_events WHERE 1=1';
  const params: unknown[] = [];
  if (category)   { q += ' AND category = ?'; params.push(category); }
  if (onlyErrors) { q += ' AND ok = 0'; }
  if (trace)      { q += ' AND trace_id = ?'; params.push(trace); }
  if (search) {
    q += ' AND (action LIKE ? OR ref_id LIKE ? OR actor LIKE ? OR detail LIKE ?)';
    const like = `%${search}%`;
    params.push(like, like, like, like);
  }
  q += ' ORDER BY at DESC, rowid DESC LIMIT ?';
  params.push(limit);

  const rows = await c.env.DB.prepare(q).bind(...params).all();
  return c.json({ data: rows.results });
});

// Prueba integral de dependencias. Produce correo y tarjeta de Teams reales.
router.post('/diagnostics/run', async (c) => {
  const roles = c.get('userRoles') ?? [];
  if (!roles.includes('flowapp-admin')) {
    return c.json({ error: 'forbidden', message: 'Solo administradores' }, 403);
  }

  const runId = newTraceId('diag');
  const actor = c.get('userEmail');
  const checks: Array<{ name: string; label: string; ok: boolean; duration_ms: number; detail: string }> = [];

  await c.env.DB.prepare(
    'INSERT INTO sys_test_runs (id, status, initiated_by) VALUES (?, ?, ?)'
  ).bind(runId, 'running', actor).run();
  await logEvent(c.env.DB, {
    category: 'diagnostic', action: 'run_started', trace_id: runId, source: 'admin',
    ref_type: 'diagnostic_run', ref_id: runId, actor,
  });

  const check = async (name: string, label: string, fn: () => Promise<string>) => {
    const startedAt = Date.now();
    try {
      const detail = await fn();
      const result = { name, label, ok: true, duration_ms: Date.now() - startedAt, detail };
      checks.push(result);
      await logEvent(c.env.DB, {
        category: 'diagnostic', action: 'check_passed', trace_id: runId, source: 'admin',
        ref_type: 'diagnostic_run', ref_id: runId, actor, duration_ms: result.duration_ms,
        detail: { check: name, label, result: detail },
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      const result = { name, label, ok: false, duration_ms: Date.now() - startedAt, detail };
      checks.push(result);
      await logEvent(c.env.DB, {
        category: 'diagnostic', action: 'check_failed', ok: false, severity: 'error',
        trace_id: runId, source: 'admin', ref_type: 'diagnostic_run', ref_id: runId,
        actor, duration_ms: result.duration_ms, detail: { check: name, label, error: detail },
      });
    }
  };

  await check('configuration', 'Configuración segura', async () => {
    const missing = [
      ['TOKEN_SECRET', c.env.TOKEN_SECRET], ['ENTRA_TENANT_ID', c.env.ENTRA_TENANT_ID],
      ['ENTRA_CLIENT_ID', c.env.ENTRA_CLIENT_ID], ['ENTRA_CLIENT_SECRET', c.env.ENTRA_CLIENT_SECRET],
      ['MAIL_SENDER_UPN', c.env.MAIL_SENDER_UPN], ['TEAMS_WEBHOOK_URL', c.env.TEAMS_WEBHOOK_URL],
    ].filter(([, value]) => !value?.trim()).map(([name]) => name);
    if (missing.length) throw new Error(`Faltan variables: ${missing.join(', ')}`);
    return 'Variables requeridas presentes; valores ocultos';
  });

  await check('database', 'Base de datos D1', async () => {
    const row = await c.env.DB.prepare(
      'SELECT datetime(\'now\') AS now, (SELECT COUNT(*) FROM request_types) AS processes'
    ).first<{ now: string; processes: number }>();
    return `Disponible · ${row?.processes ?? 0} procesos configurados`;
  });

  await check('kv', 'Almacenamiento temporal KV', async () => {
    const key = `diagnostic:${runId}`;
    await c.env.KV.put(key, runId, { expirationTtl: 60 });
    const value = await c.env.KV.get(key);
    await c.env.KV.delete(key);
    if (value !== runId) throw new Error('La lectura de verificación no coincidió');
    return 'Escritura, lectura y limpieza correctas';
  });

  let graphToken = '';
  await check('graph', 'Microsoft Graph', async () => {
    graphToken = await getAppToken(
      c.env.ENTRA_TENANT_ID, c.env.ENTRA_CLIENT_ID, c.env.ENTRA_CLIENT_SECRET, c.env.KV,
    );
    if (!graphToken) throw new Error('Graph no devolvió credencial');
    return 'Autenticación de aplicación correcta';
  });

  await check('email', 'Correo de prueba', async () => {
    if (!actor) throw new Error('El usuario actual no tiene correo');
    if (!graphToken) graphToken = await getAppToken(
      c.env.ENTRA_TENANT_ID, c.env.ENTRA_CLIENT_ID, c.env.ENTRA_CLIENT_SECRET, c.env.KV,
    );
    await sendMail({
      to: actor, subject: `[FlowApp] Prueba integral ${runId.slice(-8)}`,
      html: `<p>La prueba técnica de FlowApp validó el canal de correo.</p><p>Referencia: <strong>${runId}</strong></p>`,
      text: `La prueba técnica de FlowApp validó el canal de correo. Referencia: ${runId}`,
    }, c.env.MAIL_SENDER_UPN || actor, graphToken);
    return `Mensaje enviado a ${actor}`;
  });

  await check('teams', 'Canal de Microsoft Teams', async () => {
    const result = await sendTeamsCard(c.env, {
      title: 'Prueba integral de FlowApp', tone: 'good', traceId: runId,
      refType: 'diagnostic_run', refId: runId, source: 'admin-diagnostic',
      facts: [{ label: 'Iniciada por', value: actor || 'Administrador' }, { label: 'Referencia', value: runId }],
      url: appUrl(c.env, '/admin'), urlLabel: 'Abrir Administración',
    });
    if (!result.ok) throw new Error(result.skipped ? 'Webhook no configurado' : `Teams respondió ${result.status ?? 'sin estado'}: ${result.response || 'sin detalle'}`);
    return `Tarjeta aceptada por Teams (${result.status})`;
  });

  await check('public_review', 'Ruta pública de aprobación', async () => {
    const base = (c.env.PUBLIC_API_URL || '').replace(/\/+$/, '');
    if (!base) throw new Error('PUBLIC_API_URL no está configurada');
    const response = await fetch(`${base}/review`, { redirect: 'manual' });
    if (response.status >= 500 || response.status === 404) throw new Error(`La ruta respondió HTTP ${response.status}`);
    return `Ruta publicada y accesible (HTTP ${response.status})`;
  });

  const passed = checks.filter(item => item.ok).length;
  const status = passed === checks.length ? 'passed' : passed === 0 ? 'failed' : 'partial';
  const summary = { run_id: runId, status, passed, total: checks.length, checks };
  await c.env.DB.prepare(
    "UPDATE sys_test_runs SET completed_at = datetime('now'), status = ?, summary_json = ? WHERE id = ?"
  ).bind(status, JSON.stringify(summary), runId).run();
  await logEvent(c.env.DB, {
    category: 'diagnostic', action: 'run_completed', ok: status === 'passed',
    severity: status === 'passed' ? 'info' : 'warn', trace_id: runId, source: 'admin',
    ref_type: 'diagnostic_run', ref_id: runId, actor,
    detail: { status, passed, total: checks.length },
  });

  return c.json({ data: summary });
});

router.get('/diagnostics/runs', async (c) => {
  const roles = c.get('userRoles') ?? [];
  if (!roles.includes('flowapp-admin')) return c.json({ error: 'forbidden' }, 403);
  const limit = Math.min(Number(c.req.query('limit')) || 10, 30);
  const rows = await c.env.DB.prepare(
    'SELECT * FROM sys_test_runs ORDER BY started_at DESC LIMIT ?'
  ).bind(limit).all();
  return c.json({ data: rows.results });
});

// ─── Process Builder: actualizar nombre/descripción ──────────────────────────
router.patch('/processes/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{ name?: string; description?: string; is_active?: number }>();

  const sets: string[] = [];
  const vals: unknown[] = [];
  if (body.name !== undefined && body.name.trim()) { sets.push('name = ?'); vals.push(body.name.trim()); }
  if (body.description !== undefined) { sets.push('description = ?'); vals.push(body.description?.trim() || null); }
  if (body.is_active !== undefined) { sets.push('is_active = ?'); vals.push(body.is_active); }
  if (sets.length === 0) return c.json({ error: 'Nada que actualizar' }, 400);

  vals.push(id);
  await c.env.DB.prepare(`UPDATE request_types SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();

  // Mantener el nombre denormalizado en solicitudes activas
  if (body.name !== undefined && body.name.trim()) {
    await c.env.DB.prepare(
      "UPDATE requests SET request_type_name = ? WHERE request_type_id = ? AND status IN ('draft','pending','in_progress')"
    ).bind(body.name.trim(), id).run();
  }

  const updated = await c.env.DB.prepare('SELECT * FROM request_types WHERE id = ?').bind(id).first();
  return c.json({ data: updated });
});

// ─── Process Builder: archivar si tiene historia; eliminar solo si está vacío ─
router.delete('/processes/:id', async (c) => {
  const id = c.req.param('id');
  const process = await c.env.DB.prepare(
    `SELECT rt.id, rt.name,
            (SELECT COUNT(*) FROM requests r WHERE r.request_type_id = rt.id) AS request_count
     FROM request_types rt WHERE rt.id = ?`
  ).bind(id).first<{ id: string; name: string; request_count: number }>();

  if (!process) return c.json({ error: 'Proceso no encontrado' }, 404);

  if (Number(process.request_count) > 0) {
    await c.env.DB.prepare('UPDATE request_types SET is_active = 0 WHERE id = ?').bind(id).run();
    return c.json({
      data: {
        deleted: false,
        archived: true,
        request_count: Number(process.request_count),
        message: 'El proceso fue archivado para conservar la trazabilidad de sus solicitudes.',
      },
    });
  }

  // Las versiones no tienen ON DELETE CASCADE porque son evidencia inmutable.
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM process_versions WHERE process_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM request_type_close_fields WHERE request_type_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM request_type_fields WHERE request_type_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM flow_configs WHERE request_type_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM process_configs WHERE id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM request_types WHERE id = ?').bind(id),
  ]);

  return c.json({
    data: {
      deleted: true,
      archived: false,
      request_count: 0,
      message: 'El proceso fue eliminado definitivamente.',
    },
  });
});

// ─── Form fields por tipo de solicitud ───────────────────────────────────────
router.get('/form-fields/:typeId', async (c) => {
  const rows = await c.env.DB.prepare(`
    SELECT id, request_type_id, field_key, label, field_type,
           placeholder, required, options_json, sort_order
    FROM request_type_fields
    WHERE request_type_id = ?
    ORDER BY sort_order, created_at
  `).bind(c.req.param('typeId')).all();
  return c.json({ data: rows.results ?? [] });
});

router.put('/form-fields/:typeId', async (c) => {
  const typeId = c.req.param('typeId');
  const fields = await c.req.json<Array<{
    field_key: string; label: string;
    field_type: string; placeholder?: string;
    required?: number; options_json?: string; sort_order?: number;
  }>>();

  if (!Array.isArray(fields)) return c.json({ error: 'Se esperaba un array' }, 400);

  const stmts = [
    c.env.DB.prepare('DELETE FROM request_type_fields WHERE request_type_id = ?').bind(typeId),
    ...fields.map((f, i) =>
      c.env.DB.prepare(`
        INSERT INTO request_type_fields
          (id, request_type_id, field_key, label, field_type, placeholder, required, options_json, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        crypto.randomUUID().slice(0, 8), typeId,
        f.field_key, f.label, f.field_type,
        f.placeholder ?? null,
        f.required ?? 0,
        f.options_json ?? null,
        f.sort_order ?? i
      )
    ),
  ];

  await c.env.DB.batch(stmts);
  return c.json({ data: { saved: fields.length } });
});

// ─── Campos del formulario de CIERRE por tipo ────────────────────────────────
router.get('/close-fields/:typeId', async (c) => {
  const rows = await c.env.DB.prepare(`
    SELECT id, request_type_id, field_key, label, field_type,
           placeholder, required, options_json, sort_order
    FROM request_type_close_fields
    WHERE request_type_id = ?
    ORDER BY sort_order, created_at
  `).bind(c.req.param('typeId')).all();
  return c.json({ data: rows.results ?? [] });
});

router.put('/close-fields/:typeId', async (c) => {
  const typeId = c.req.param('typeId');
  const fields = await c.req.json<Array<{
    field_key: string; label: string;
    field_type: string; placeholder?: string;
    required?: number; options_json?: string; sort_order?: number;
  }>>();

  if (!Array.isArray(fields)) return c.json({ error: 'Se esperaba un array' }, 400);

  const stmts = [
    c.env.DB.prepare('DELETE FROM request_type_close_fields WHERE request_type_id = ?').bind(typeId),
    ...fields.map((f, i) =>
      c.env.DB.prepare(`
        INSERT INTO request_type_close_fields
          (id, request_type_id, field_key, label, field_type, placeholder, required, options_json, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        crypto.randomUUID().slice(0, 8), typeId,
        f.field_key, f.label, f.field_type,
        f.placeholder ?? null,
        f.required ?? 0,
        f.options_json ?? null,
        f.sort_order ?? i
      )
    ),
  ];

  await c.env.DB.batch(stmts);
  return c.json({ data: { saved: fields.length } });
});

// ─── Process Configs (wizard) ────────────────────────────────────────────────
router.get('/process-config/:typeId', async (c) => {
  const row = await c.env.DB.prepare(
    'SELECT * FROM process_configs WHERE id = ?'
  ).bind(c.req.param('typeId')).first();
  return c.json({ data: row ?? null });
});

router.put('/process-config/:typeId', async (c) => {
  const typeId = c.req.param('typeId');
  const body = await c.req.json<{
    form_schema_json?: string;
    close_schema_json?: string;
    email_subject?: string;
    email_body?: string;
    send_on_approve?: number;
    color?: string;
    icon?: string;
    category?: string;
    default_sla_days?: number;
  }>();

  const sets: string[] = ["updated_at = datetime('now')"];
  const vals: unknown[] = [];

  if (body.form_schema_json  !== undefined) { sets.push('form_schema_json = ?');  vals.push(body.form_schema_json); }
  if (body.close_schema_json !== undefined) { sets.push('close_schema_json = ?'); vals.push(body.close_schema_json); }
  if (body.email_subject     !== undefined) { sets.push('email_subject = ?');     vals.push(body.email_subject); }
  if (body.email_body        !== undefined) { sets.push('email_body = ?');        vals.push(body.email_body); }
  if (body.send_on_approve   !== undefined) { sets.push('send_on_approve = ?');   vals.push(body.send_on_approve); }
  if (body.color             !== undefined) { sets.push('color = ?');             vals.push(body.color); }
  if (body.icon              !== undefined) { sets.push('icon = ?');              vals.push(body.icon); }
  if (body.category          !== undefined) { sets.push('category = ?');          vals.push(body.category); }
  if (body.default_sla_days  !== undefined) {
    const days = Math.round(Number(body.default_sla_days));
    if (!Number.isFinite(days) || days < 1 || days > 365) return c.json({ error: 'validation_error', message: 'SLA inválido' }, 400);
    sets.push('default_sla_days = ?'); vals.push(days);
  }

  vals.push(typeId);

  // Upsert
  await c.env.DB.prepare(`
    INSERT INTO process_configs (id, ${sets.filter(s => !s.includes('updated_at')).map(s => s.split(' = ')[0]).join(', ')}, updated_at)
    VALUES (?, ${sets.filter(s => !s.includes('updated_at')).map(() => '?').join(', ')}, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET ${sets.join(', ')}
  `).bind(typeId, ...vals.slice(0, -1), ...vals).run().catch(async () => {
    // Fallback simple update / insert
    const exists = await c.env.DB.prepare('SELECT id FROM process_configs WHERE id = ?').bind(typeId).first();
    if (exists) {
      await c.env.DB.prepare(`UPDATE process_configs SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
    } else {
      await c.env.DB.prepare(`
        INSERT INTO process_configs (id, form_schema_json, close_schema_json, email_subject, email_body, color, icon, category, default_sla_days)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(typeId,
        body.form_schema_json ?? '[]', body.close_schema_json ?? '[]',
        body.email_subject ?? null, body.email_body ?? null,
        body.color ?? '#0284C7', body.icon ?? 'flow', body.category ?? null, body.default_sla_days ?? 5
      ).run();
    }
  });

  const updated = await c.env.DB.prepare('SELECT * FROM process_configs WHERE id = ?').bind(typeId).first();
  return c.json({ data: updated });
});

// ─── Costos de campaña (Marketing) ────────────────────────────────────────────
router.post('/campaign-costs', async (c) => {
  const body = await c.req.json<{
    request_id: string; campaign_code: string; total_amount: number;
    currency?: string; execution_date: string; billing_date: string;
    notes?: string;
    vendors: { vendor_name: string; amount: number; is_selected: boolean }[];
  }>();

  const costId = crypto.randomUUID().slice(0, 12);
  await c.env.DB.batch([
    c.env.DB.prepare(`
      INSERT INTO campaign_costs (id, request_id, campaign_code, total_amount, currency, execution_date, billing_date, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(costId, body.request_id, body.campaign_code, body.total_amount,
             body.currency ?? 'USD', body.execution_date, body.billing_date, body.notes ?? null),
    ...body.vendors.map(v =>
      c.env.DB.prepare(`
        INSERT INTO campaign_vendors (id, campaign_cost_id, vendor_name, amount, is_selected)
        VALUES (?, ?, ?, ?, ?)
      `).bind(crypto.randomUUID().slice(0,12), costId, v.vendor_name, v.amount, v.is_selected ? 1 : 0)
    ),
  ]);
  return c.json({ data: { id: costId } }, 201);
});

// ═══════════════════════════════════════════════════════════════════════════
//  VERSIONES DE PROCESO
//
//  Publicar una versión no toca lo que ya está en ejecución: cada solicitud
//  guarda la versión con la que nació y la ejecución lee ese snapshot.
//  Restaurar tampoco reescribe la historia: publica una versión nueva cuyo
//  contenido es igual al de la elegida, para que el registro siga siendo
//  cronológico y auditable.
// ═══════════════════════════════════════════════════════════════════════════

interface VersionSnapshot {
  name?: string;
  description?: string | null;
  levels?: { label: string; approver_type: string; approver_value: string; approver_name?: string | null; approver_email?: string | null }[];
  fields?: { field_key: string; label: string; field_type: string; placeholder?: string | null; required?: boolean | number; options_json?: string | null; sort_order?: number }[];
  form_schema_json?: string;
  email_subject?: string;
  email_body?: string;
  color?: string;
  icon?: string;
  category?: string | null;
  default_sla_days?: number;
  workspace_id?: string | null;
  assignment_mode?: string | null;
  fixed_assignee_id?: string | null;
  fixed_assignee_name?: string | null;
  fixed_assignee_email?: string | null;
  execution_sla_days?: number | null;
  checklist?: { label: string; required?: boolean }[];
  deliverables?: { label: string; required?: boolean }[];
  require_requester_confirmation?: number;
}

// Historial con el impacto real de cada versión: cuántas solicitudes nacieron
// con ella y cuántas siguen vivas bajo sus reglas.
router.get('/processes/:id/versions', async (c) => {
  const processId = c.req.param('id');
  const rows = await c.env.DB.prepare(`
    SELECT pv.id, pv.version, pv.name, pv.description, pv.created_by, pv.created_at,
           (SELECT COUNT(*) FROM requests r WHERE r.process_version_id = pv.id) AS requests_total,
           (SELECT COUNT(*) FROM requests r
             WHERE r.process_version_id = pv.id
               AND r.status IN ('draft','pending','in_progress')) AS requests_open
    FROM process_versions pv
    WHERE pv.process_id = ?
    ORDER BY pv.version DESC
  `).bind(processId).all();

  const current = await c.env.DB.prepare(
    'SELECT id FROM process_versions WHERE process_id = ? ORDER BY version DESC LIMIT 1'
  ).bind(processId).first<{ id: string }>();

  return c.json({ data: rows.results, currentVersionId: current?.id ?? null });
});

// Contenido completo de una versión, para inspeccionarla antes de restaurar.
router.get('/processes/:id/versions/:versionId', async (c) => {
  const row = await c.env.DB.prepare(
    'SELECT id, process_id, version, name, description, snapshot_json, created_by, created_at FROM process_versions WHERE id = ? AND process_id = ?'
  ).bind(c.req.param('versionId'), c.req.param('id')).first<Record<string, unknown>>();
  if (!row) return c.json({ error: 'not_found' }, 404);

  let snapshot: VersionSnapshot | null = null;
  try { snapshot = JSON.parse(String(row.snapshot_json)) as VersionSnapshot; } catch { snapshot = null; }
  return c.json({ data: { ...row, snapshot } });
});

router.post('/processes/:id/versions/:versionId/restore', async (c) => {
  const processId = c.req.param('id');
  const versionId = c.req.param('versionId');

  const source = await c.env.DB.prepare(
    'SELECT id, version, name, description, snapshot_json FROM process_versions WHERE id = ? AND process_id = ?'
  ).bind(versionId, processId).first<{ id: string; version: number; name: string; description: string | null; snapshot_json: string }>();
  if (!source) return c.json({ error: 'not_found', message: 'Esa versión no existe' }, 404);

  let snapshot: VersionSnapshot;
  try { snapshot = JSON.parse(source.snapshot_json) as VersionSnapshot; }
  catch { return c.json({ error: 'corrupt_snapshot', message: 'El contenido de esa versión no se puede leer' }, 422); }

  // Las versiones creadas por la migración inicial solo guardaron la parte de
  // formulario. Restaurar una de ellas borraría aprobadores y campos, así que
  // se rechaza en vez de dejar el proceso a medias.
  if (!Array.isArray(snapshot.levels) || !Array.isArray(snapshot.fields)) {
    return c.json({
      error: 'incomplete_snapshot',
      message: 'Esa versión es anterior al versionado completo y no guarda aprobadores ni campos. No se puede restaurar sin dañar el proceso.',
    }, 422);
  }

  const latest = await c.env.DB.prepare(
    'SELECT MAX(version) AS version FROM process_versions WHERE process_id = ?'
  ).bind(processId).first<{ version: number | null }>();
  const nextVersion = (latest?.version ?? 0) + 1;

  const name = (snapshot.name ?? source.name).trim();
  const description = snapshot.description ?? source.description ?? null;

  // Los snapshots anteriores a Process Studio v2 guardan formulario y
  // aprobadores pero no la configuración de ejecución. Restaurar uno de ellos
  // con valores por defecto borraría el checklist, los entregables y la
  // asignación vigentes: lo que el snapshot no trae, se conserva.
  const live = await c.env.DB.prepare(`
    SELECT workspace_id, assignment_mode, fixed_assignee_id, fixed_assignee_name,
           fixed_assignee_email, execution_sla_days, checklist_json, deliverables_json,
           require_requester_confirmation
    FROM process_configs WHERE id = ?
  `).bind(processId).first<Record<string, unknown>>();

  const keep = <T>(fromSnapshot: T | undefined | null, fromLive: unknown, fallback: T): T =>
    fromSnapshot !== undefined && fromSnapshot !== null
      ? fromSnapshot
      : (fromLive ?? fallback) as T;

  const checklistJson = Array.isArray(snapshot.checklist)
    ? JSON.stringify(snapshot.checklist)
    : (live?.checklist_json as string | null) ?? '[]';
  const deliverablesJson = Array.isArray(snapshot.deliverables)
    ? JSON.stringify(snapshot.deliverables)
    : (live?.deliverables_json as string | null) ?? '[]';

  const statements: D1PreparedStatement[] = [
    c.env.DB.prepare('UPDATE request_types SET name = ?, description = ? WHERE id = ?')
      .bind(name, description, processId),
    c.env.DB.prepare('DELETE FROM flow_configs WHERE request_type_id = ?').bind(processId),
    c.env.DB.prepare('DELETE FROM request_type_fields WHERE request_type_id = ?').bind(processId),
  ];

  snapshot.levels.forEach((level, index) => {
    statements.push(c.env.DB.prepare(`
      INSERT INTO flow_configs
        (id, request_type_id, level, label, approver_type, approver_value, approver_name, approver_email)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      crypto.randomUUID().slice(0, 8), processId, index + 1, level.label,
      level.approver_type, level.approver_value,
      level.approver_name ?? null, level.approver_email ?? null,
    ));
  });

  snapshot.fields.forEach((field, index) => {
    statements.push(c.env.DB.prepare(`
      INSERT INTO request_type_fields
        (id, request_type_id, field_key, label, field_type, placeholder, required, options_json, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      crypto.randomUUID().slice(0, 8), processId, field.field_key, field.label,
      field.field_type, field.placeholder ?? null, field.required ? 1 : 0,
      field.options_json ?? null, field.sort_order ?? index,
    ));
  });

  statements.push(c.env.DB.prepare(`
    INSERT INTO process_configs
      (id, form_schema_json, email_subject, email_body, color, icon, category, default_sla_days,
       workspace_id, assignment_mode, fixed_assignee_id, fixed_assignee_name, fixed_assignee_email,
       execution_sla_days, checklist_json, deliverables_json, require_requester_confirmation, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      form_schema_json = excluded.form_schema_json,
      email_subject = excluded.email_subject,
      email_body = excluded.email_body,
      color = excluded.color,
      icon = excluded.icon,
      category = excluded.category,
      default_sla_days = excluded.default_sla_days,
      workspace_id = excluded.workspace_id,
      assignment_mode = excluded.assignment_mode,
      fixed_assignee_id = excluded.fixed_assignee_id,
      fixed_assignee_name = excluded.fixed_assignee_name,
      fixed_assignee_email = excluded.fixed_assignee_email,
      execution_sla_days = excluded.execution_sla_days,
      checklist_json = excluded.checklist_json,
      deliverables_json = excluded.deliverables_json,
      require_requester_confirmation = excluded.require_requester_confirmation,
      updated_at = datetime('now')
  `).bind(
    processId, snapshot.form_schema_json ?? '[]',
    snapshot.email_subject ?? '', snapshot.email_body ?? '',
    snapshot.color ?? '#0284C7', snapshot.icon ?? 'flow',
    snapshot.category ?? null, snapshot.default_sla_days ?? 5,
    keep(snapshot.workspace_id, live?.workspace_id, null),
    keep(snapshot.assignment_mode, live?.assignment_mode, 'auto_load'),
    keep(snapshot.fixed_assignee_id, live?.fixed_assignee_id, null),
    keep(snapshot.fixed_assignee_name, live?.fixed_assignee_name, null),
    keep(snapshot.fixed_assignee_email, live?.fixed_assignee_email, null),
    keep(snapshot.execution_sla_days, live?.execution_sla_days, null),
    checklistJson, deliverablesJson,
    keep(snapshot.require_requester_confirmation, live?.require_requester_confirmation, 1),
  ));

  statements.push(c.env.DB.prepare(`
    INSERT INTO process_versions
      (id, process_id, version, name, description, snapshot_json, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    crypto.randomUUID(), processId, nextVersion, name, description,
    source.snapshot_json, c.get('userEmail'),
  ));

  await c.env.DB.batch(statements);
  await logEvent(c.env.DB, {
    category: 'config', action: 'process_version_restored',
    trace_id: c.get('traceId'), source: 'process-versions',
    ref_type: 'process', ref_id: processId, actor: c.get('userEmail'),
    detail: { restored_from: source.version, published_as: nextVersion },
  });

  return c.json({ data: { restored_from: source.version, version: nextVersion } });
});

export default router;
