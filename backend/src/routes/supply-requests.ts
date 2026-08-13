import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import type { AppEnv } from '../types';

const router = new Hono<AppEnv>();

router.use('*', authMiddleware);

router.get('/', async (c) => {
  const rows = await c.env.DB.prepare(`
    SELECT
      r.*,
      l.name as center_name
    FROM supply_requests r
    LEFT JOIN inventory_locations l
      ON l.id = r.center_location_id
    ORDER BY r.created_at DESC
  `).all();

  return c.json({
    data: rows.results ?? [],
  });
});

router.get('/:id', async (c) => {
  const { id } = c.req.param();

  const request = await c.env.DB.prepare(`
    SELECT *
    FROM supply_requests
    WHERE id = ?
  `).bind(id).first();

  if (!request) {
    return c.json({
      error: 'not_found',
    }, 404);
  }

  const lines = await c.env.DB.prepare(`
    SELECT
      l.*,
      i.sku,
      i.name as item_name
    FROM supply_request_lines l
    LEFT JOIN inventory_items i
      ON i.id = l.item_id
    WHERE l.request_id = ?
  `).bind(id).all();

  return c.json({
    data: {
      request,
      lines: lines.results ?? [],
    }
  });
});

router.post('/', async (c) => {
  const body = await c.req.json<{
    center_location_id: string;
    justification?: string;
    required_date?: string;
    lines: {
      item_id: string;
      quantity_requested: number;
      notes?: string;
    }[];
  }>();

  if (!body.center_location_id) {
    return c.json({
      error: 'validation_error',
      message: 'Centro requerido',
    }, 400);
  }

  if (!body.lines?.length) {
    return c.json({
      error: 'validation_error',
      message: 'Debe existir al menos un item',
    }, 400);
  }

  const id = crypto.randomUUID();
  const requestNumber =
    'REQ-' +
    new Date().toISOString().slice(0,10).replace(/-/g,'') +
    '-' +
    Math.floor(Math.random() * 10000).toString().padStart(4, '0');

  const requesterEmail = c.get('userEmail') || 'unknown';
  const requesterName = c.get('userName') || '';

  await c.env.DB.prepare(`
    INSERT INTO supply_requests (
      id,
      request_number,
      center_location_id,
      requester_email,
      requester_name,
      status,
      justification,
      required_date
    )
    VALUES (?, ?, ?, ?, ?, 'pending_approval', ?, ?)
  `).bind(
    id,
    requestNumber,
    body.center_location_id,
    requesterEmail,
    requesterName,
    body.justification ?? '',
    body.required_date ?? null
  ).run();

  for (const line of body.lines) {
    await c.env.DB.prepare(`
      INSERT INTO supply_request_lines (
        id,
        request_id,
        item_id,
        quantity_requested,
        notes
      )
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      crypto.randomUUID(),
      id,
      line.item_id,
      line.quantity_requested,
      line.notes ?? ''
    ).run();
  }

  return c.json({
    data: {
      id,
      request_number: requestNumber,
      status: 'pending_approval',
    }
  });
});

export default router;
