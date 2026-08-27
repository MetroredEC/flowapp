import { Context, Hono } from 'hono';
import { AppEnv } from '../types';
import { notifyApprover, createRequestWithSteps } from '../utils/approvals';
import { startProcessByKey } from '../utils/bpm-engine';
import { completeTaskFromRequest } from '../utils/workspace-bridge';
import { logEvent } from '../utils/syslog';
import { addBusinessDays, parseEventDetail, recordWorkEvent } from '../utils/work-events';
import { resolveNotifyAt, type NotifyRule } from '../utils/notify-schedule';

const router = new Hono<AppEnv>();

// GET /requests - listar solicitudes
router.get('/', async (c) => {
  const { status, type, q } = c.req.query();
  const userId = c.get('userId');
  const roles = c.get('userRoles');
  const isAdmin = isPrivileged(roles);

  let sql = `SELECT r.*,
    (SELECT COUNT(*) FROM attachments WHERE request_id = r.id) as attachment_count,
    (SELECT json_group_array(json_object(
      'level', level, 'approver_name', approver_name, 'status', status, 'decided_at', decided_at
    )) FROM approval_steps WHERE request_id = r.id ORDER BY level) as steps
    FROM requests r WHERE 1=1`;
  const params: unknown[] = [];

  if (!isAdmin) { sql += ' AND r.requester_id = ?'; params.push(userId); }
  if (status) { sql += ' AND r.status = ?'; params.push(status); }
  if (type) { sql += ' AND r.request_type_id = ?'; params.push(type); }
  if (q) {
    sql += ' AND (r.title LIKE ? OR r.description LIKE ?)';
    params.push(`%${q}%`, `%${q}%`);
  }
  sql += ' ORDER BY r.created_at DESC LIMIT 100';

  const rows = await c.env.DB.prepare(sql).bind(...params).all();
  const data = (rows.results ?? []).map((r: Record<string, unknown>) => ({
    ...r,
    steps: typeof r.steps === 'string' ? safeJsonParse(r.steps, []) : (r.steps ?? []),
  }));
  return c.json({ data });
});

// GET /requests/:id
router.get('/:id', async (c) => {
  const id = c.req.param('id');
  const userId = c.get('userId');
  const roles = c.get('userRoles');
  const isAdmin = isPrivileged(roles);

  const request = await c.env.DB.prepare('SELECT * FROM requests WHERE id = ?').bind(id).first<{ requester_id: string } & Record<string, unknown>>();
  if (!request) return c.json({ error: 'not_found' }, 404);
  if (!isAdmin && request.requester_id !== userId) {
    const assigned = await c.env.DB.prepare(`
      SELECT id FROM approval_steps
      WHERE request_id = ? AND (approver_id = ? OR lower(approver_email) = lower(?))
      LIMIT 1
    `).bind(id, userId, c.get('userEmail')).first();
    if (!assigned) return c.json({ error: 'forbidden', message: 'No tienes acceso a esta solicitud' }, 403);
  }

  const [steps, attachments, campaignCost, closure, timeline, linkedTask] = await Promise.all([
    c.env.DB.prepare('SELECT * FROM approval_steps WHERE request_id = ? ORDER BY level').bind(id).all(),
    c.env.DB.prepare('SELECT id, filename, r2_key, content_type, size_bytes, is_selected, created_at FROM attachments WHERE request_id = ? ORDER BY created_at').bind(id).all(),
    c.env.DB.prepare('SELECT cc.*, json_group_array(json_object(\'vendor_name\',cv.vendor_name,\'amount\',cv.amount,\'is_selected\',cv.is_selected)) as vendors FROM campaign_costs cc LEFT JOIN campaign_vendors cv ON cv.campaign_cost_id = cc.id WHERE cc.request_id = ? GROUP BY cc.id').bind(id).first(),
    c.env.DB.prepare('SELECT * FROM request_closures WHERE request_id = ?').bind(id).first(),
    c.env.DB.prepare('SELECT * FROM work_events WHERE request_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 200').bind(id).all(),
    c.env.DB.prepare("SELECT id, space_id, status, assignee_name, assignee_email, due_date FROM ws_tasks WHERE source_type = 'request' AND source_id = ? AND archived = 0 LIMIT 1").bind(id).first(),
  ]);

  return c.json({
    data: {
      ...request,
      steps: steps.results,
      attachments: attachments.results,
      campaign_cost: campaignCost ?? null,
      closure: closure ?? null,
      linked_task: linkedTask ?? null,
      timeline: (timeline.results ?? []).map((event: Record<string, unknown>) => ({
        ...event,
        detail: parseEventDetail(event.detail_json),
      })),
    },
  });
});

// POST /requests - crear solicitud en borrador
router.post('/', async (c) => {
  const body = await c.req.json();
  if (!body.request_type_id || !body.title?.trim() || !body.description?.trim()) {
    return c.json({ error: 'Campos requeridos: request_type_id, title, description' }, 400);
  }

  const requestId = await createRequestWithSteps({
    requestTypeId: body.request_type_id,
    title: body.title.trim(),
    description: body.description.trim(),
    requesterId: c.get('userId'),
    requesterName: c.get('userName'),
    requesterEmail: c.get('userEmail'),
    campaignData: body.campaign_data,
  }, c.env);

  // BPM heredado solo aplica al flujo explícito de suministros. El resto de
  // solicitudes usa flow_configs y no debe arrancar el proceso de compras.
  if (body.request_type_id === 'rt-suministros') {
    try {
      await startProcessByKey(
        'suministros', requestId, body.payload_json || body.campaign_data || {}, c.env
      );
      await logEvent(c.env.DB, {
        category: 'request', action: 'bpm_started', ref_type: 'request', ref_id: requestId,
        actor: c.get('userEmail'), detail: { process_key: 'suministros' },
      });
    } catch (e) {
      await logEvent(c.env.DB, {
        category: 'request', action: 'bpm_start_failed', ok: false,
        ref_type: 'request', ref_id: requestId, actor: c.get('userEmail'),
        detail: { process_key: 'suministros', error: e instanceof Error ? e.message : String(e) },
      });
    }
  }

  return c.json({ data: { id: requestId } }, 201);
});

// POST /requests/:id/attachments - subir archivo
router.post('/:id/attachments', async (c) => {
  const requestId = c.req.param('id');
  const userId = c.get('userId');
  const roles = c.get('userRoles');
  const req = await c.env.DB.prepare('SELECT requester_id, status FROM requests WHERE id = ?')
    .bind(requestId).first<{ requester_id: string; status: string }>();
  if (!req) return c.json({ error: 'not_found', message: 'Solicitud no encontrada' }, 404);
  if (!isPrivileged(roles) && req.requester_id !== userId) return c.json({ error: 'forbidden' }, 403);
  if (!['draft', 'pending', 'in_progress'].includes(req.status)) {
    return c.json({ error: 'invalid_status', message: 'Solo se pueden adjuntar archivos a solicitudes activas' }, 400);
  }

  const formData = await c.req.formData();
  const file = formData.get('file') as File | null;
  if (!file) return c.json({ error: 'file requerido' }, 400);
  if (file.size <= 0) return c.json({ error: 'Archivo vacio' }, 400);
  if (file.size > 20 * 1024 * 1024) return c.json({ error: 'Archivo demasiado grande (max 20 MB)' }, 400);

  const filename = safeFileName(file.name || 'archivo');
  const key = `${requestId}/${crypto.randomUUID()}-${filename}`;
  const contentType = file.type || 'application/octet-stream';
  await c.env.FILES.put(key, file.stream(), {
    httpMetadata: { contentType },
    customMetadata: { filename: file.name || filename, uploadedBy: userId },
  });

  const attId = crypto.randomUUID();
  await c.env.DB.prepare(
    'INSERT INTO attachments (id, request_id, filename, r2_key, content_type, size_bytes, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(attId, requestId, file.name || filename, key, contentType, file.size, userId).run();
  await writeAudit(c.env.DB, 'requests', requestId, 'attachment_uploaded', userId, c.get('userName'), {
    attachment_id: attId,
    filename: file.name || filename,
    size_bytes: file.size,
  });
  await recordWorkEvent(c.env.DB, {
    requestId, eventType: 'attachment_uploaded', title: 'Archivo adjuntado',
    actorId: userId, actorName: c.get('userName'), actorEmail: c.get('userEmail'),
    detail: { attachment_id: attId, filename: file.name || filename, size_bytes: file.size },
  });

  return c.json({ data: { id: attId, filename: file.name || filename, size_bytes: file.size } }, 201);
});

// PATCH /requests/:id/submit - confirmar borrador y enviar
router.patch('/:id/submit', async (c) => {
  const id = c.req.param('id');
  const userId = c.get('userId');
  const req = await c.env.DB.prepare(
    'SELECT requester_id, status, process_version_id, request_type_id, campaign_data FROM requests WHERE id = ?'
  ).bind(id).first<{
    requester_id: string; status: string; process_version_id: string | null;
    request_type_id: string; campaign_data: string | null;
  }>();
  if (!req) return c.json({ error: 'not_found' }, 404);
  if (req.requester_id !== userId) return c.json({ error: 'forbidden' }, 403);
  if (req.status !== 'draft') return c.json({ error: 'Solo se pueden enviar solicitudes en borrador' }, 400);

  // El solicitante puede pedir que el aviso salga en una fecha concreta, si el
  // proceso lo permite. El cuerpo es opcional: enviar sin cuerpo sigue valiendo.
  const body = await c.req.json<{ notify_at?: string }>().catch(() => ({ notify_at: undefined }));

  const sla = req.process_version_id
    ? await c.env.DB.prepare(`
        SELECT COALESCE(json_extract(pv.snapshot_json, '$.default_sla_days'), pc.default_sla_days, 5) AS days
        FROM process_versions pv LEFT JOIN process_configs pc ON pc.id = pv.process_id
        WHERE pv.id = ?
      `).bind(req.process_version_id).first<{ days: number }>()
    : null;
  const slaDays = Math.max(1, Number(sla?.days ?? 5));
  const slaDueAt = addBusinessDays(new Date(), slaDays);

  // Si la migración de programación aún no se aplicó, estas columnas no
  // existen. Enviar una solicitud es la operación más crítica del producto y no
  // puede depender de una función opcional: sin regla, se avisa de inmediato.
  let notifyRule: NotifyRule | null = null;
  try {
    notifyRule = await c.env.DB.prepare(`
      SELECT notify_mode, notify_field_key, notify_offset_days, notify_time, allow_requester_schedule
      FROM process_configs WHERE id = ?
    `).bind(req.request_type_id).first<NotifyRule>();
  } catch (error) {
    console.error('NOTIFY_RULE_UNAVAILABLE', error instanceof Error ? error.message : String(error));
  }

  let answers: Record<string, unknown> | null = null;
  try {
    const parsed = req.campaign_data ? JSON.parse(req.campaign_data) as { fields?: Record<string, unknown> } : null;
    answers = parsed?.fields ?? null;
  } catch { answers = null; }

  const notifyAt = resolveNotifyAt(notifyRule ?? null, answers, body.notify_at ?? null);

  try {
    await c.env.DB.prepare(`
      UPDATE requests SET status='in_progress', current_level=1,
        submitted_at=datetime('now'), sla_due_at=?, scheduled_notify_at=?, updated_at=datetime('now')
      WHERE id=?
    `).bind(slaDueAt, notifyAt, id).run();
  } catch {
    // Misma razón: sin la columna de programación, el envío sigue funcionando.
    await c.env.DB.prepare(`
      UPDATE requests SET status='in_progress', current_level=1,
        submitted_at=datetime('now'), sla_due_at=?, updated_at=datetime('now')
      WHERE id=?
    `).bind(slaDueAt, id).run();
  }

  // Programada: el aviso lo enviará el barrido cuando llegue la fecha. La
  // solicitud queda registrada igual, solo que su aprobador aún no la ve.
  if (notifyAt) {
    await writeAudit(c.env.DB, 'requests', id, 'request_submitted_scheduled', userId, c.get('userName'), { notify_at: notifyAt });
    await logEvent(c.env.DB, {
      category: 'request', action: 'submitted_scheduled', ref_type: 'request', ref_id: id,
      actor: c.get('userEmail'), detail: { notify_at: notifyAt },
    });
    await recordWorkEvent(c.env.DB, {
      requestId: id, eventType: 'request_submitted', title: 'Solicitud enviada, aviso programado',
      actorId: userId, actorName: c.get('userName'), actorEmail: c.get('userEmail'),
      detail: { sla_days: slaDays, sla_due_at: slaDueAt, notify_at: notifyAt },
    });
    return c.json({ data: { submitted: true, scheduled_notify_at: notifyAt } });
  }

  try {
    await notifyApprover(id, 1, c.env);
    try {
      await c.env.DB.prepare("UPDATE requests SET notified_at = datetime('now') WHERE id = ?").bind(id).run();
    } catch { /* columna aún no migrada: no afecta al aviso ya enviado */ }
    await writeAudit(c.env.DB, 'requests', id, 'request_submitted', userId, c.get('userName'));
    await logEvent(c.env.DB, {
      category: 'request', action: 'submitted', ref_type: 'request', ref_id: id,
      actor: c.get('userEmail'),
    });
    await recordWorkEvent(c.env.DB, {
      requestId: id, eventType: 'request_submitted', title: 'Solicitud enviada a aprobación',
      actorId: userId, actorName: c.get('userName'), actorEmail: c.get('userEmail'),
      detail: { sla_days: slaDays, sla_due_at: slaDueAt },
    });
    return c.json({ data: { submitted: true } });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('SUBMIT_NOTIFY_FAILED', message);
    await c.env.DB.prepare("UPDATE requests SET status='draft', current_level=1, submitted_at=NULL, sla_due_at=NULL, updated_at=datetime('now') WHERE id=?")
      .bind(id).run();
    await writeAudit(c.env.DB, 'requests', id, 'notification_failed', userId, c.get('userName'), { message });
    await logEvent(c.env.DB, {
      category: 'request', action: 'submit_failed_reverted_to_draft', ok: false,
      ref_type: 'request', ref_id: id, actor: c.get('userEmail'), detail: { error: message },
    });
    return c.json({
      error: 'notification_failed',
      message: 'La solicitud se guardo con sus adjuntos, pero no se pudo enviar el correo al aprobador: ' + message,
    }, 502);
  }
});

// PATCH /requests/:id/cancel
router.patch('/:id/cancel', async (c) => {
  const id = c.req.param('id');
  const userId = c.get('userId');
  const req = await c.env.DB.prepare('SELECT requester_id, status FROM requests WHERE id = ?').bind(id).first<{ requester_id: string; status: string }>();
  if (!req) return c.json({ error: 'not_found' }, 404);
  if (req.requester_id !== userId) return c.json({ error: 'forbidden' }, 403);
  if (!['draft', 'pending', 'in_progress'].includes(req.status)) {
    return c.json({ error: 'Solo se puede cancelar solicitudes activas' }, 400);
  }

  // Un borrador es privado: cancelarlo no le cuesta tiempo a nadie. En cambio,
  // cancelar algo que ya movió a un aprobador exige explicar por qué.
  const body = await c.req.json<{ reason?: string }>().catch(() => ({ reason: undefined }));
  const reason = (body.reason ?? '').trim();
  if (req.status !== 'draft' && reason.length < 10) {
    return c.json({ error: 'reason_required', message: 'Explica en al menos 10 caracteres por qué cancelas la solicitud' }, 400);
  }

  await c.env.DB.prepare("UPDATE requests SET status='cancelled', cancel_reason=?, cancelled_at=datetime('now'), updated_at=datetime('now') WHERE id=?")
    .bind(reason || null, id).run();
  await writeAudit(c.env.DB, 'requests', id, 'request_cancelled', userId, c.get('userName'), { reason });
  await recordWorkEvent(c.env.DB, {
    requestId: id, eventType: 'request_cancelled', title: 'Solicitud cancelada',
    actorId: userId, actorName: c.get('userName'), actorEmail: c.get('userEmail'),
    detail: reason ? { reason } : null,
  });
  return c.json({ data: { cancelled: true } });
});

// GET /requests/:id/close-form — campos del formulario de cierre + datos ya guardados
router.get('/:id/close-form', async (c) => {
  const id = c.req.param('id');
  const userId = c.get('userId');
  const roles = c.get('userRoles');

  const req = await c.env.DB.prepare(
    'SELECT id, request_type_id, requester_id, status FROM requests WHERE id = ?'
  ).bind(id).first<{ id: string; request_type_id: string; requester_id: string; status: string }>();

  if (!req) return c.json({ error: 'not_found' }, 404);
  if (!isPrivileged(roles) && req.requester_id !== userId) return c.json({ error: 'forbidden' }, 403);

  const [fields, closure] = await Promise.all([
    c.env.DB.prepare(
      'SELECT * FROM request_type_close_fields WHERE request_type_id = ? ORDER BY sort_order, created_at'
    ).bind(req.request_type_id).all(),
    c.env.DB.prepare('SELECT * FROM request_closures WHERE request_id = ?').bind(id).first(),
  ]);

  return c.json({
    data: {
      fields: fields.results ?? [],
      closure: closure ?? null,
    },
  });
});

// POST /requests/:id/close — guardar formulario de cierre
router.post('/:id/close', async (c) => {
  const id = c.req.param('id');
  const userId = c.get('userId');
  const userName = c.get('userName');
  const roles = c.get('userRoles');

  const req = await c.env.DB.prepare(
    'SELECT id, requester_id, status FROM requests WHERE id = ?'
  ).bind(id).first<{ id: string; requester_id: string; status: string }>();

  if (!req) return c.json({ error: 'not_found' }, 404);
  if (!isPrivileged(roles) && req.requester_id !== userId) return c.json({ error: 'forbidden' }, 403);
  if (req.status !== 'approved') {
    return c.json({ error: 'invalid_status', message: 'Solo se puede cerrar una solicitud aprobada' }, 400);
  }

  const body = await c.req.json<{ form_data: Record<string, unknown> }>();
  const closureId = crypto.randomUUID().slice(0, 8);

  await c.env.DB.prepare(`
    INSERT INTO request_closures (id, request_id, closed_by_id, closed_by_name, form_data_json)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(request_id) DO UPDATE SET
      closed_by_id = excluded.closed_by_id,
      closed_by_name = excluded.closed_by_name,
      closed_at = datetime('now'),
      form_data_json = excluded.form_data_json
  `).bind(closureId, id, userId, userName, JSON.stringify(body.form_data ?? {})).run();

  await writeAudit(c.env.DB, 'requests', id, 'request_closed', userId, userName, { form_data: body.form_data });
  await c.env.DB.prepare("UPDATE requests SET closed_at=datetime('now'), updated_at=datetime('now') WHERE id=?").bind(id).run();
  await recordWorkEvent(c.env.DB, {
    requestId: id, eventType: 'request_closed', title: 'Proceso cerrado',
    actorId: userId, actorName: userName, actorEmail: c.get('userEmail'),
    detail: { closure_id: closureId },
  });

  // Puente: marcar la tarea del workspace como completada
  try {
    await completeTaskFromRequest(c.env.DB, id);
  } catch (e) {
    console.error('WS_BRIDGE_CLOSE_ERROR', e instanceof Error ? e.message : String(e));
  }

  return c.json({ data: { closed: true } });
});

// ═══════════════════════════════════════════════════════════════════════════
//  AUTOGESTIÓN DEL SOLICITANTE
//
//  El solicitante debe poder resolver solo lo que hoy resuelve escribiendo por
//  chat: corregir, cancelar, duplicar, confirmar, devolver, reabrir y calificar.
//  Todo queda en la línea de tiempo: autogestión no significa perder trazabilidad.
// ═══════════════════════════════════════════════════════════════════════════

/** Solo el dueño de la solicitud puede autogestionarla. */
async function ownedRequest(c: RequestContext, id: string) {
  const row = await c.env.DB.prepare('SELECT * FROM requests WHERE id = ?').bind(id).first<RequestRow>();
  if (!row) return { error: c.json({ error: 'not_found' }, 404) } as const;
  if (row.requester_id !== c.get('userId')) {
    return { error: c.json({ error: 'forbidden', message: 'Solo el solicitante puede hacer esto' }, 403) } as const;
  }
  return { row } as const;
}

// PATCH /requests/:id — corregir mientras no haya sido aprobada
router.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const found = await ownedRequest(c, id);
  if (found.error) return found.error;
  const req = found.row;

  // Una vez aprobada, el contenido es la base del trabajo en curso: cambiarlo
  // en silencio dejaría al equipo ejecutando algo que ya nadie pidió.
  if (!['draft', 'pending', 'in_progress'].includes(req.status)) {
    return c.json({ error: 'invalid_status', message: 'Ya no puedes editar una solicitud aprobada, rechazada o cancelada' }, 400);
  }

  const body = await c.req.json<{ title?: string; description?: string; campaign_data?: unknown }>();
  const sets: string[] = ["updated_at = datetime('now')"];
  const vals: unknown[] = [];
  const changed: string[] = [];

  if (body.title !== undefined) {
    const title = String(body.title).trim();
    if (!title) return c.json({ error: 'invalid_title', message: 'El título no puede quedar vacío' }, 400);
    sets.push('title = ?'); vals.push(title); changed.push('título');
  }
  if (body.description !== undefined) {
    sets.push('description = ?'); vals.push(String(body.description)); changed.push('descripción');
  }
  if (body.campaign_data !== undefined) {
    sets.push('campaign_data = ?');
    vals.push(typeof body.campaign_data === 'string' ? body.campaign_data : JSON.stringify(body.campaign_data));
    changed.push('formulario');
  }
  if (!changed.length) return c.json({ error: 'nothing_to_update', message: 'No hay cambios que guardar' }, 400);

  vals.push(id);
  await c.env.DB.prepare(`UPDATE requests SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();

  await writeAudit(c.env.DB, 'requests', id, 'request_edited', c.get('userId'), c.get('userName'), { changed });
  await recordWorkEvent(c.env.DB, {
    requestId: id, eventType: 'request_edited', title: `Solicitud corregida por el solicitante`,
    actorId: c.get('userId'), actorName: c.get('userName'), actorEmail: c.get('userEmail'),
    detail: { changed },
  });

  const updated = await c.env.DB.prepare('SELECT * FROM requests WHERE id = ?').bind(id).first();
  return c.json({ data: updated });
});

// POST /requests/:id/duplicate — volver a pedir lo mismo sin llenar todo otra vez
router.post('/:id/duplicate', async (c) => {
  const id = c.req.param('id');
  const userId = c.get('userId');
  const roles = c.get('userRoles');

  const req = await c.env.DB.prepare('SELECT * FROM requests WHERE id = ?').bind(id).first<RequestRow>();
  if (!req) return c.json({ error: 'not_found' }, 404);
  if (!isPrivileged(roles) && req.requester_id !== userId) {
    return c.json({ error: 'forbidden', message: 'Solo puedes duplicar tus propias solicitudes' }, 403);
  }

  // La copia nace como borrador y toma la versión vigente del proceso: duplicar
  // no debe revivir una configuración que ya fue reemplazada.
  const version = await c.env.DB.prepare(
    'SELECT id, version FROM process_versions WHERE process_id = ? ORDER BY version DESC LIMIT 1'
  ).bind(req.request_type_id).first<{ id: string; version: number }>();

  const newId = crypto.randomUUID().replace(/-/g, '');
  await c.env.DB.prepare(`
    INSERT INTO requests (
      id, request_type_id, request_type_name, title, description,
      requester_id, requester_name, requester_email, status, current_level,
      total_levels, campaign_data, process_version_id, process_version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', 1, ?, ?, ?, ?)
  `).bind(
    newId, req.request_type_id, req.request_type_name,
    `${req.title} (copia)`, req.description,
    userId, c.get('userName'), c.get('userEmail'),
    req.total_levels, req.campaign_data,
    version?.id ?? req.process_version_id, version?.version ?? req.process_version,
  ).run();

  await writeAudit(c.env.DB, 'requests', newId, 'request_duplicated', userId, c.get('userName'), { from: id });
  await recordWorkEvent(c.env.DB, {
    requestId: newId, eventType: 'request_created', title: 'Solicitud duplicada de una anterior',
    actorId: userId, actorName: c.get('userName'), actorEmail: c.get('userEmail'),
    detail: { duplicated_from: id },
  });

  const created = await c.env.DB.prepare('SELECT * FROM requests WHERE id = ?').bind(newId).first();
  return c.json({ data: created });
});

// POST /requests/:id/confirm — el solicitante acepta la entrega y cierra el ciclo
router.post('/:id/confirm', async (c) => {
  const id = c.req.param('id');
  const found = await ownedRequest(c, id);
  if (found.error) return found.error;
  const req = found.row;

  if (!req.delivered_at) {
    return c.json({ error: 'not_delivered', message: 'Todavía no hay una entrega que confirmar' }, 400);
  }
  if (req.confirmed_at) {
    return c.json({ error: 'already_confirmed', message: 'Ya confirmaste esta entrega' }, 400);
  }

  await c.env.DB.prepare(`
    UPDATE requests SET confirmed_at = datetime('now'),
      closed_at = COALESCE(closed_at, datetime('now')), updated_at = datetime('now')
    WHERE id = ?
  `).bind(id).run();

  await writeAudit(c.env.DB, 'requests', id, 'delivery_confirmed', c.get('userId'), c.get('userName'));
  await recordWorkEvent(c.env.DB, {
    requestId: id, eventType: 'delivery_confirmed', title: 'El solicitante confirmó la recepción',
    actorId: c.get('userId'), actorName: c.get('userName'), actorEmail: c.get('userEmail'),
  });

  return c.json({ data: { confirmed: true } });
});

// POST /requests/:id/return — devolver la entrega con motivo y reabrir el trabajo
router.post('/:id/return', async (c) => {
  const id = c.req.param('id');
  const found = await ownedRequest(c, id);
  if (found.error) return found.error;
  const req = found.row;

  if (!req.delivered_at || req.confirmed_at) {
    return c.json({ error: 'not_returnable', message: 'Solo puedes devolver una entrega pendiente de confirmación' }, 400);
  }

  const body = await c.req.json<{ reason?: string }>();
  const reason = (body.reason ?? '').trim();
  if (reason.length < 10) {
    return c.json({ error: 'reason_required', message: 'Explica en al menos 10 caracteres qué falta o qué está mal' }, 400);
  }

  await c.env.DB.prepare(
    'INSERT INTO request_returns (request_id, reason, returned_by_id, returned_by_name, returned_by_email) VALUES (?, ?, ?, ?, ?)'
  ).bind(id, reason, c.get('userId'), c.get('userName'), c.get('userEmail')).run();

  await c.env.DB.prepare(`
    UPDATE requests SET delivered_at = NULL, reopen_due_at = NULL,
      closed_at = NULL, updated_at = datetime('now')
    WHERE id = ?
  `).bind(id).run();

  await reopenTaskForRequest(c.env.DB, id, `Devuelta por el solicitante: ${reason}`);

  await writeAudit(c.env.DB, 'requests', id, 'delivery_returned', c.get('userId'), c.get('userName'), { reason });
  await recordWorkEvent(c.env.DB, {
    requestId: id, eventType: 'delivery_returned', title: 'El solicitante devolvió la entrega',
    actorId: c.get('userId'), actorName: c.get('userName'), actorEmail: c.get('userEmail'),
    detail: { reason },
  });

  return c.json({ data: { returned: true } });
});

/** Días que el solicitante tiene para reabrir después de confirmar. */
const REOPEN_WINDOW_DAYS = 7;

// POST /requests/:id/reopen — reabrir dentro del plazo acordado
router.post('/:id/reopen', async (c) => {
  const id = c.req.param('id');
  const found = await ownedRequest(c, id);
  if (found.error) return found.error;
  const req = found.row;

  if (!req.confirmed_at) {
    return c.json({ error: 'not_confirmed', message: 'Solo se reabre una solicitud que ya fue confirmada' }, 400);
  }
  if (req.reopen_due_at && req.reopen_due_at < new Date().toISOString()) {
    return c.json({
      error: 'reopen_window_closed',
      message: `El plazo de ${REOPEN_WINDOW_DAYS} días para reabrir ya venció. Crea una solicitud nueva.`,
    }, 400);
  }

  const body = await c.req.json<{ reason?: string }>();
  const reason = (body.reason ?? '').trim();
  if (reason.length < 10) {
    return c.json({ error: 'reason_required', message: 'Explica en al menos 10 caracteres por qué debe reabrirse' }, 400);
  }

  await c.env.DB.prepare(`
    UPDATE requests SET confirmed_at = NULL, delivered_at = NULL, closed_at = NULL,
      reopen_due_at = NULL, reopen_count = reopen_count + 1, updated_at = datetime('now')
    WHERE id = ?
  `).bind(id).run();

  await reopenTaskForRequest(c.env.DB, id, `Reabierta por el solicitante: ${reason}`);

  await writeAudit(c.env.DB, 'requests', id, 'request_reopened', c.get('userId'), c.get('userName'), { reason });
  await recordWorkEvent(c.env.DB, {
    requestId: id, eventType: 'request_reopened', title: 'El solicitante reabrió la solicitud',
    actorId: c.get('userId'), actorName: c.get('userName'), actorEmail: c.get('userEmail'),
    detail: { reason, reopen_count: Number(req.reopen_count ?? 0) + 1 },
  });

  return c.json({ data: { reopened: true } });
});

// POST /requests/:id/feedback — calificar el servicio recibido
router.post('/:id/feedback', async (c) => {
  const id = c.req.param('id');
  const found = await ownedRequest(c, id);
  if (found.error) return found.error;
  const req = found.row;

  if (!req.confirmed_at) {
    return c.json({ error: 'not_confirmed', message: 'Puedes calificar después de confirmar la entrega' }, 400);
  }

  const body = await c.req.json<{ rating?: number; comment?: string }>();
  const rating = Number(body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return c.json({ error: 'invalid_rating', message: 'La calificación va de 1 a 5' }, 400);
  }

  await c.env.DB.prepare(`
    INSERT INTO request_feedback (request_id, rating, comment, rated_by_id, rated_by_name, rated_by_email)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(request_id) DO UPDATE SET
      rating = excluded.rating, comment = excluded.comment, created_at = datetime('now')
  `).bind(id, rating, (body.comment ?? '').trim() || null,
    c.get('userId'), c.get('userName'), c.get('userEmail')).run();

  await recordWorkEvent(c.env.DB, {
    requestId: id, eventType: 'request_rated', title: 'El solicitante calificó el servicio',
    actorId: c.get('userId'), actorName: c.get('userName'), actorEmail: c.get('userEmail'),
    detail: { rating },
  });

  return c.json({ data: { rating } });
});

/** Devuelve la tarea del área a un estado abierto y avisa a quien la ejecuta. */
async function reopenTaskForRequest(db: D1Database, requestId: string, note: string): Promise<void> {
  const task = await db.prepare(
    "SELECT id, title, space_id, assignee_email FROM ws_tasks WHERE source_type = 'request' AND source_id = ?"
  ).bind(requestId).first<{ id: string; title: string; space_id: string; assignee_email: string | null }>();
  if (!task) return;

  const openStatus = await db.prepare(
    'SELECT key FROM ws_space_statuses WHERE space_id = ? AND is_done = 0 ORDER BY sort_order LIMIT 1'
  ).bind(task.space_id).first<{ key: string }>();
  if (!openStatus) return;

  await db.prepare(
    "UPDATE ws_tasks SET status = ?, completed_at = NULL, updated_at = datetime('now') WHERE id = ?"
  ).bind(openStatus.key, task.id).run();

  await db.prepare(`
    INSERT INTO ws_task_activity (task_id, actor_name, action, meta_json)
    VALUES (?, 'FlowApp', 'status', ?)
  `).bind(task.id, JSON.stringify({ to: openStatus.key, source: note })).run();

  if (task.assignee_email) {
    await db.prepare(`
      INSERT INTO ws_notifications (user_email, type, task_id, task_title, space_id, actor_name, body)
      VALUES (?, 'status', ?, ?, ?, 'FlowApp', ?)
    `).bind(task.assignee_email, task.id, task.title, task.space_id, note).run();
  }
}

interface RequestRow {
  id: string; request_type_id: string; request_type_name: string;
  title: string; description: string;
  requester_id: string; requester_name: string; requester_email: string;
  status: string; current_level: number; total_levels: number;
  campaign_data: string | null;
  process_version_id: string | null; process_version: number | null;
  delivered_at: string | null; confirmed_at: string | null;
  reopen_due_at: string | null; reopen_count: number | null;
  closed_at: string | null;
}

type RequestContext = Context<AppEnv>;

function isPrivileged(roles: string[]): boolean {
  return roles.includes('flowapp-admin') || roles.includes('flowapp-approver');
}

function safeFileName(name: string): string {
  const cleaned = name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_');
  return cleaned.replace(/_+/g, '_').slice(0, 120) || 'archivo';
}

function safeJsonParse(value: string, fallback: unknown): unknown {
  try { return JSON.parse(value); }
  catch { return fallback; }
}

async function writeAudit(db: D1Database, entity: string, entityId: string, action: string, actorId: string, actorName: string, details?: unknown): Promise<void> {
  await db.prepare('INSERT INTO audit_log (entity, entity_id, action, actor_id, actor_name, details) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(entity, entityId, action, actorId, actorName, details ? JSON.stringify(details) : null)
    .run();
}

export default router;
