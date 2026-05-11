import { postMovement } from '../utils/inventory-engine';
import { Hono } from 'hono';
import { AppEnv } from '../types';

const router = new Hono<AppEnv>();

// CREATE LOCATION
router.post('/locations', async (c) => {
 const db = c.env.DB;
 const body = await c.req.json();

 const id = crypto.randomUUID();

 await db.prepare(`
  INSERT INTO inventory_locations (id, code, name)
  VALUES (?, ?, ?)
 `).bind(id, body.code, body.name).run();

 return c.json({ data: { id } });
});

// CREATE ITEM
router.post('/items', async (c) => {
 const db = c.env.DB;
 const body = await c.req.json();

 const id = crypto.randomUUID();

 await db.prepare(`
  INSERT INTO inventory_items (id, sku, name, unit)
  VALUES (?, ?, ?, ?)
 `).bind(id, body.sku, body.name, body.unit || 'unidad').run();

 return c.json({ data: { id } });
});

// GET STOCK
router.get('/stock', async (c) => {
 const db = c.env.DB;

 const rows = await db.prepare(`
  SELECT location_id, item_id, quantity_on_hand, average_cost
  FROM inventory_stock_balances
 `).all();

 return c.json({ data: rows.results });
});

router.post('/movements', async (c) => {
 const body = await c.req.json();
 const id = crypto.randomUUID();

 const movementNumber = body.movement_number || `${body.movement_type}-${Date.now()}`;

 await c.env.DB.prepare(`
  INSERT INTO inventory_movements (
   id, movement_number, movement_type, status, source_location_id, target_location_id,
   reference_type, reference_number, notes,
   created_by_id, created_by_name, created_by_email
  )
  VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?)
 `).bind(
  id,
  movementNumber,
  body.movement_type,
  body.source_location_id ?? null,
  body.target_location_id ?? null,
  body.reference_type ?? null,
  body.reference_number ?? null,
  body.notes ?? null,
  c.get('userId'),
  c.get('userName'),
  c.get('userEmail')
 ).run();

 for (const line of body.lines ?? []) {
  const quantity = Number(line.quantity);
  const unitCost = Number(line.unit_cost ?? 0);
  const totalCost = Number(line.total_cost ?? quantity * unitCost);

  await c.env.DB.prepare(`
   INSERT INTO inventory_movement_lines (
    id, movement_id, item_id, lot_id, quantity, unit_cost, total_cost, notes
   )
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
   crypto.randomUUID(),
   id,
   line.item_id,
   line.lot_id ?? null,
   quantity,
   unitCost,
   totalCost,
   line.notes ?? null
  ).run();
 }

 return c.json({ data: { id, movement_number: movementNumber } }, 201);
});

router.post('/movements/:id/post', async (c) => {
 const { id } = c.req.param();
 await postMovement(id, c.env);
 return c.json({ data: { posted: true, movementId: id } });
});

router.post('/test-post/:id', async (c) => {
 const { id } = c.req.param();

 await postMovement(id, c.env);

 return c.json({
  data: {
   posted: true,
   movementId: id
  }
 });
});

router.get('/kardex', async (c) => {
 const itemId = c.req.query('item_id');
 const locationId = c.req.query('location_id');

 const where: string[] = [];
 const params: string[] = [];

 if (itemId) {
  where.push('k.item_id = ?');
  params.push(itemId);
 }

 if (locationId) {
  where.push('k.location_id = ?');
  params.push(locationId);
 }

 const sql = `
  SELECT
   k.created_at,
   k.entry_type,
   k.location_id,
   loc.name as location_name,
   k.item_id,
   i.name as item_name,
   k.lot_id,
   lot.lot_code,
   k.quantity_in,
   k.quantity_out,
   k.unit_cost,
   k.total_cost,
   k.balance_quantity,
   k.balance_unit_cost,
   k.balance_total_value,
   m.movement_number,
   m.movement_type
  FROM inventory_kardex_entries k
  JOIN inventory_movements m ON m.id = k.movement_id
  JOIN inventory_items i ON i.id = k.item_id
  JOIN inventory_locations loc ON loc.id = k.location_id
  LEFT JOIN inventory_lots lot ON lot.id = k.lot_id
  ${where.length ? 'WHERE ' + where.join(' AND '): ''}
  ORDER BY k.created_at DESC
  LIMIT 200
 `;

 const rows = await c.env.DB.prepare(sql).bind(...params).all();

 return c.json({ data: rows.results ?? [] });
});

export default router;
