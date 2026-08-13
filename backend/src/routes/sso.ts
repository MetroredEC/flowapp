import { Hono } from 'hono';
import { AppEnv } from '../types';
import { sendTeamsCard, appUrl } from '../utils/teams';

const router = new Hono<AppEnv>();

interface SSOSale {
  id: string;
  empresa: string;
  contacto_nombre: string;
  contacto_correo: string;
  contacto_telefono: string;
  monto_venta: number;
  numero_contrato: string | null;
  numero_cotizacion: string | null;
  servicio_contratado: string | null;
  fecha_inicio: string | null;
  estado: 'prospecto' | 'negociacion' | 'propuesta' | 'cerrado_ganado' | 'cerrado_perdido';
  probabilidad: number;
  observaciones: string | null;
  created_at: string;
  updated_at: string;
}

// ─── GET /sales — Listar todas las ventas ───────────────────────────────────
router.get('/sales', async (c) => {
  const estado = c.req.query('estado');
  const search = c.req.query('search');

  let query = 'SELECT * FROM sso_sales WHERE 1=1';
  const params: any[] = [];

  if (estado) {
    query += ' AND estado = ?';
    params.push(estado);
  }

  if (search) {
    query += ' AND (empresa LIKE ? OR contacto_nombre LIKE ? OR contacto_correo LIKE ?)';
    const searchTerm = `%${search}%`;
    params.push(searchTerm, searchTerm, searchTerm);
  }

  query += ' ORDER BY created_at DESC';

  const stmt = c.env.DB.prepare(query);
  const result = await stmt.bind(...params).all();

  return c.json({ data: result.results || [] });
});

// ─── GET /api/sso/sales/:id — Obtener una venta ────────────────────────────────
router.get('/sales/:id', async (c) => {
  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT * FROM sso_sales WHERE id = ?')
    .bind(id).first();

  return c.json({ data: row ?? null });
});

// ─── POST /api/sso/sales — Crear nueva venta ──────────────────────────────────
router.post('/sales', async (c) => {
  const body = await c.req.json<Partial<SSOSale> & { created_by?: string }>();

  await c.env.DB.prepare(`
    INSERT INTO sso_sales (
      empresa, contacto_nombre, contacto_correo, contacto_telefono,
      monto_venta, numero_contrato, numero_cotizacion, servicio_contratado,
      fecha_inicio, estado, probabilidad, observaciones, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    body.empresa || '',
    body.contacto_nombre || '',
    body.contacto_correo || '',
    body.contacto_telefono || '',
    body.monto_venta || 0,
    body.numero_contrato || null,
    body.numero_cotizacion || null,
    body.servicio_contratado || null,
    body.fecha_inicio || null,
    body.estado || 'prospecto',
    body.probabilidad || 0,
    body.observaciones || null,
    body.created_by || 'unknown'
  ).run();

  const created = await c.env.DB.prepare(
    'SELECT * FROM sso_sales ORDER BY created_at DESC LIMIT 1'
  ).first();

  return c.json({ data: created }, { status: 201 });
});

// ─── PATCH /api/sso/sales/:id — Actualizar venta ─────────────────────────────────
router.patch('/sales/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<Partial<SSOSale>>();

  const updates: string[] = ['updated_at = datetime("now")'];
  const values: any[] = [];

  if (body.empresa !== undefined) { updates.push('empresa = ?'); values.push(body.empresa); }
  if (body.contacto_nombre !== undefined) { updates.push('contacto_nombre = ?'); values.push(body.contacto_nombre); }
  if (body.contacto_correo !== undefined) { updates.push('contacto_correo = ?'); values.push(body.contacto_correo); }
  if (body.contacto_telefono !== undefined) { updates.push('contacto_telefono = ?'); values.push(body.contacto_telefono); }
  if (body.monto_venta !== undefined) { updates.push('monto_venta = ?'); values.push(body.monto_venta); }
  if (body.numero_contrato !== undefined) { updates.push('numero_contrato = ?'); values.push(body.numero_contrato); }
  if (body.numero_cotizacion !== undefined) { updates.push('numero_cotizacion = ?'); values.push(body.numero_cotizacion); }
  if (body.servicio_contratado !== undefined) { updates.push('servicio_contratado = ?'); values.push(body.servicio_contratado); }
  if (body.fecha_inicio !== undefined) { updates.push('fecha_inicio = ?'); values.push(body.fecha_inicio); }
  if (body.estado !== undefined) { updates.push('estado = ?'); values.push(body.estado); }
  if (body.probabilidad !== undefined) { updates.push('probabilidad = ?'); values.push(body.probabilidad); }
  if (body.observaciones !== undefined) { updates.push('observaciones = ?'); values.push(body.observaciones); }
  if ((body as any).origen !== undefined) { updates.push('origen = ?'); values.push((body as any).origen); }
  if ((body as any).proxima_accion !== undefined) { updates.push('proxima_accion = ?'); values.push((body as any).proxima_accion); }
  if ((body as any).proxima_accion_fecha !== undefined) { updates.push('proxima_accion_fecha = ?'); values.push((body as any).proxima_accion_fecha); }

  values.push(id);

  const prev = await c.env.DB.prepare('SELECT * FROM sso_sales WHERE id = ?').bind(id).first() as any;

  await c.env.DB.prepare(`
    UPDATE sso_sales SET ${updates.join(', ')} WHERE id = ?
  `).bind(...values).run();

  const updated = await c.env.DB.prepare('SELECT * FROM sso_sales WHERE id = ?')
    .bind(id).first() as any;

  // ── Puente: venta ganada → tarea en Operaciones ──────────────────────────
  if (body.estado === 'cerrado_ganado' && prev?.estado !== 'cerrado_ganado' && updated) {
    const exists = await c.env.DB.prepare(
      "SELECT id FROM ws_tasks WHERE source_type = 'sale' AND source_id = ?"
    ).bind(id).first();
    if (!exists) {
      const fields = {
        empresa: updated.empresa,
        contacto: updated.contacto_nombre,
        correo: updated.contacto_correo,
        telefono: updated.contacto_telefono,
        monto: updated.monto_venta,
        contrato: updated.numero_contrato,
        cotizacion: updated.numero_cotizacion,
        servicio: updated.servicio_contratado,
        fecha_inicio: updated.fecha_inicio,
      };
      await c.env.DB.prepare(`
        INSERT INTO ws_tasks (space_id, title, description, status, priority,
          created_by_name, created_by_email, source_type, source_id, custom_fields_json)
        VALUES ('operaciones', ?, ?, 'todo', 'high', 'SSO', ?, 'sale', ?, ?)
      `).bind(
        `Implementar: ${updated.empresa}`,
        `Venta cerrada por $${updated.monto_venta}. Servicio: ${updated.servicio_contratado || 'N/A'}.`,
        c.get('userEmail') || 'sso',
        id,
        JSON.stringify(fields)
      ).run();

      const task = await c.env.DB.prepare(
        "SELECT id FROM ws_tasks WHERE source_type = 'sale' AND source_id = ? LIMIT 1"
      ).bind(id).first() as any;
      if (task) {
        await c.env.DB.prepare(`
          INSERT INTO ws_task_activity (task_id, actor_name, actor_email, action, meta_json)
          VALUES (?, 'SSO', ?, 'created', ?)
        `).bind(task.id, c.get('userEmail') || 'sso', JSON.stringify({ source: 'venta ganada' })).run();
      }

      // Canal de Teams: venta ganada → implementación en Operaciones
      await sendTeamsCard(c.env, {
        title: 'Venta ganada — enviada a Operaciones',
        tone: 'good',
        facts: [
          { label: 'Empresa', value: String(updated.empresa ?? '') },
          { label: 'Monto', value: `$${Number(updated.monto_venta ?? 0).toLocaleString('es-EC')}` },
          { label: 'Servicio', value: String(updated.servicio_contratado ?? 'N/A') },
          { label: 'Vendedor', value: c.get('userName') || 'SSO' },
        ],
        url: appUrl(c.env, '/espacio/operaciones'),
        urlLabel: 'Ver tablero de Operaciones',
        traceId: id, refType: 'sale', refId: id, source: 'sso-pipeline',
      });
    }
  }

  return c.json({ data: updated });
});

// ─── ACTIVIDADES (timeline CRM) ────────────────────────────────────────────────
router.get('/sales/:id/activities', async (c) => {
  const id = c.req.param('id');
  const rows = await c.env.DB.prepare(
    'SELECT * FROM sso_activities WHERE sale_id = ? ORDER BY created_at DESC LIMIT 100'
  ).bind(id).all();
  return c.json({ data: rows.results });
});

router.post('/sales/:id/activities', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{
    type?: string; body: string;
    proxima_accion?: string; proxima_accion_fecha?: string;
  }>();
  if (!body.body?.trim()) return c.json({ error: 'body requerido' }, 400);

  await c.env.DB.prepare(`
    INSERT INTO sso_activities (sale_id, type, body, author_name, author_email)
    VALUES (?, ?, ?, ?, ?)
  `).bind(id, body.type || 'nota', body.body.trim(), c.get('userName') || '', c.get('userEmail') || '').run();

  // Registrar/actualizar la próxima acción en la oportunidad
  if (body.proxima_accion !== undefined || body.proxima_accion_fecha !== undefined) {
    await c.env.DB.prepare(`
      UPDATE sso_sales SET proxima_accion = ?, proxima_accion_fecha = ?, updated_at = datetime('now') WHERE id = ?
    `).bind(body.proxima_accion || null, body.proxima_accion_fecha || null, id).run();
  } else {
    await c.env.DB.prepare("UPDATE sso_sales SET updated_at = datetime('now') WHERE id = ?").bind(id).run();
  }

  const created = await c.env.DB.prepare(
    'SELECT * FROM sso_activities WHERE sale_id = ? ORDER BY created_at DESC LIMIT 1'
  ).bind(id).first();
  return c.json({ data: created }, 201);
});

// ─── DELETE /api/sso/sales/:id — Eliminar venta ───────────────────────────────
router.delete('/sales/:id', async (c) => {
  const id = c.req.param('id');

  await c.env.DB.prepare('DELETE FROM sso_sales WHERE id = ?')
    .bind(id).run();

  return c.json({ success: true });
});

// ─── GET /api/sso/stats — Estadísticas de ventas ──────────────────────────────
router.get('/stats', async (c) => {
  const totalPipeline = await c.env.DB.prepare(
    'SELECT COALESCE(SUM(monto_venta), 0) as total FROM sso_sales'
  ).first() as any;

  const totalGanado = await c.env.DB.prepare(
    'SELECT COALESCE(SUM(monto_venta), 0) as total FROM sso_sales WHERE estado = "cerrado_ganado"'
  ).first() as any;

  const countByStage = await c.env.DB.prepare(
    'SELECT estado, COUNT(*) as count, COALESCE(SUM(monto_venta), 0) as total FROM sso_sales GROUP BY estado'
  ).all() as any;

  const totalSales = await c.env.DB.prepare(
    'SELECT COUNT(*) as count FROM sso_sales'
  ).first() as any;

  const closedWon = await c.env.DB.prepare(
    'SELECT COUNT(*) as count FROM sso_sales WHERE estado = "cerrado_ganado"'
  ).first() as any;

  return c.json({
    data: {
      totalPipeline: totalPipeline.total,
      totalGanado: totalGanado.total,
      totalSales: totalSales.count,
      closedWon: closedWon.count,
      conversionRate: totalSales.count > 0 ? (closedWon.count / totalSales.count) * 100 : 0,
      byStage: countByStage.results || [],
    }
  });
});

export default router;
