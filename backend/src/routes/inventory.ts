import { postMovement } from '../utils/inventory-engine';
import { Hono } from 'hono';
import { AppEnv } from '../types';

const router = new Hono<AppEnv>();

// LIST LOCATIONS
router.get('/locations', async (c) => {
  const rows = await c.env.DB.prepare(`
    SELECT id, code, name, description, is_active
    FROM inventory_locations
    WHERE is_active = 1
    ORDER BY name
  `).all();
  return c.json({ data: rows.results ?? [] });
});

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
router.get('/dashboard', async (c) => {
  const stock = await c.env.DB.prepare(`
    SELECT
      COALESCE(SUM(quantity_on_hand), 0) as total_units,
      COALESCE(SUM(total_value), 0) as total_value
    FROM inventory_stock_balances
  `).first();

  const expiredLots = await c.env.DB.prepare(`
    SELECT COUNT(*) as count
    FROM inventory_lots
    WHERE expiration_date IS NOT NULL
      AND expiration_date < date('now')
  `).first();

  const expiringLots = await c.env.DB.prepare(`
    SELECT COUNT(*) as count
    FROM inventory_lots
    WHERE expiration_date IS NOT NULL
      AND expiration_date >= date('now')
      AND expiration_date <= date('now', '+30 days')
  `).first();

  const criticalItems = await c.env.DB.prepare(`
    SELECT COUNT(*) as count
    FROM inventory_items i
    LEFT JOIN (
      SELECT item_id, SUM(quantity_on_hand) as qty
      FROM inventory_stock_balances
      GROUP BY item_id
    ) s ON s.item_id = i.id
    WHERE COALESCE(s.qty, 0) <= i.min_stock
  `).first();

  return c.json({
    data: {
      total_units: Number(stock?.total_units ?? 0),
      total_value: Number(stock?.total_value ?? 0),
      expired_lots: Number(expiredLots?.count ?? 0),
      expiring_lots_30d: Number(expiringLots?.count ?? 0),
      critical_items: Number(criticalItems?.count ?? 0),
    }
  });
});

router.get('/items', async (c) => {
  const q = (c.req.query('q') || '').trim();

  const rows = q
    ? await c.env.DB.prepare(`
        SELECT id, sku, name, unit
        FROM inventory_items
        WHERE sku LIKE ? OR name LIKE ?
        ORDER BY sku
        LIMIT 50
      `).bind(`%${q}%`, `%${q}%`).all()
    : await c.env.DB.prepare(`
        SELECT id, sku, name, unit
        FROM inventory_items
        ORDER BY sku
        LIMIT 50
      `).all();

  return c.json({ data: rows.results ?? [] });
});


router.get('/export/stock', async (c) => {
  const locationId = c.req.query('location_id');

  const sql = `
    SELECT
      isl.location_id,
      COALESCE(il.name, isl.location_id) AS location_name,
      ii.sku,
      ii.name AS item_name,
      isl.lot_id,
      isl.quantity_on_hand,
      isl.average_cost,
      isl.total_value
    FROM inventory_stock_balances isl
    LEFT JOIN inventory_locations il
      ON il.id = isl.location_id
    LEFT JOIN inventory_items ii
      ON ii.id = isl.item_id
    ${locationId ? 'WHERE isl.location_id = ?' : ''}
    ORDER BY isl.location_id, ii.name
  `;

  const stmt = c.env.DB.prepare(sql);

  const result = locationId
    ? await stmt.bind(locationId).all()
    : await stmt.all();

  const rows = result.results ?? [];

  const csv = [
    [
      'CENTRO',
      'CODIGO',
      'PRODUCTO',
      'LOTE',
      'CANTIDAD',
      'COSTO_PROMEDIO',
      'VALOR_TOTAL'
    ].join(',')
  ];

  for (const r of rows) {
    csv.push([
      `"${r.location_name ?? ''}"`,
      `"${r.sku ?? ''}"`,
      `"${String(r.item_name ?? '').replace(/"/g, '""')}"`,
      `"${r.lot_id ?? ''}"`,
      r.quantity_on_hand ?? 0,
      r.average_cost ?? 0,
      r.total_value ?? 0
    ].join(','));
  }

  return new Response(csv.join('\n'), {
    headers: {
      'Content-Type': 'text/csv;charset=utf-8',
      'Content-Disposition': 'attachment; filename="stock.csv"'
    }
  });
});

router.get('/stock', async (c) => {
  const db = c.env.DB;
  const locationId = c.req.query('location_id');
  const itemId = c.req.query('item_id');
  const q = (c.req.query('q') || '').trim();

  const where: string[] = ['sb.quantity_on_hand > 0'];
  const params: unknown[] = [];

  if (locationId) {
    where.push('sb.location_id = ?');
    params.push(locationId);
  }
  if (itemId) {
    where.push('sb.item_id = ?');
    params.push(itemId);
  }
  if (q) {
    where.push('(ii.sku LIKE ? OR ii.name LIKE ?)');
    params.push(`%${q}%`, `%${q}%`);
  }

  const sql = `
    SELECT
      sb.location_id,
      COALESCE(loc.name, sb.location_id) AS location_name,
      sb.item_id,
      ii.sku,
      ii.name AS item_name,
      ii.unit,
      sb.lot_id,
      COALESCE(lot.lot_code, '') AS lot_code,
      lot.expiration_date,
      sb.quantity_on_hand,
      sb.average_cost,
      sb.total_value
    FROM inventory_stock_balances sb
    LEFT JOIN inventory_locations loc ON loc.id = sb.location_id
    LEFT JOIN inventory_items ii ON ii.id = sb.item_id
    LEFT JOIN inventory_lots lot ON lot.id = sb.lot_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY loc.name, ii.name, lot.expiration_date
  `;

  const rows = await db.prepare(sql).bind(...params).all();
  return c.json({ data: rows.results ?? [] });
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

// UPLOAD ATTACHMENT TO MOVEMENT (facturas, guias, etc.)
router.post('/movements/:id/attachments', async (c) => {
  const movementId = c.req.param('id');

  const movement = await c.env.DB.prepare(
    'SELECT id FROM inventory_movements WHERE id = ?'
  ).bind(movementId).first<{ id: string }>();
  if (!movement) return c.json({ error: 'Movimiento no encontrado' }, 404);

  const formData = await c.req.formData();
  const file = formData.get('file') as File | null;
  if (!file) return c.json({ error: 'No se envio archivo' }, 400);

  const ext = file.name.split('.').pop() ?? 'bin';
  const key = `inventory/${movementId}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;

  await c.env.FILES.put(key, file.stream(), {
    httpMetadata: { contentType: file.type || 'application/octet-stream' },
    customMetadata: { filename: file.name, uploadedBy: c.get('userId') ?? '' },
  });

  const attId = crypto.randomUUID().slice(0, 12);
  await c.env.DB.prepare(`
    INSERT INTO inventory_attachments (id, movement_id, filename, content_type, size_bytes, r2_key, uploaded_by_id, uploaded_by_name, uploaded_by_email)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    attId, movementId, file.name,
    file.type || 'application/octet-stream',
    file.size, key,
    c.get('userId') ?? null,
    c.get('userName') ?? null,
    c.get('userEmail') ?? null
  ).run();

  return c.json({ data: { id: attId, filename: file.name, r2_key: key } }, 201);
});

// GET ATTACHMENTS FOR A MOVEMENT
router.get('/movements/:id/attachments', async (c) => {
  const rows = await c.env.DB.prepare(`
    SELECT id, filename, content_type, size_bytes, r2_key, uploaded_by_name, created_at
    FROM inventory_attachments
    WHERE movement_id = ?
    ORDER BY created_at
  `).bind(c.req.param('id')).all();
  return c.json({ data: rows.results ?? [] });
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


router.get('/export/kardex', async (c) => {
  const locationId = c.req.query('location_id');

  const sql = `
    SELECT
      ike.created_at,
      ike.movement_number,
      ike.entry_type,
      COALESCE(il.name, ike.location_id) AS location_name,
      ii.sku,
      ii.name AS item_name,
      ike.lot_id,
      ike.quantity_in,
      ike.quantity_out,
      ike.balance_quantity,
      ike.balance_total_value
    FROM inventory_kardex_entries ike
    LEFT JOIN inventory_locations il
      ON il.id = ike.location_id
    LEFT JOIN inventory_items ii
      ON ii.id = ike.item_id
    ${locationId ? 'WHERE ike.location_id = ?' : ''}
    ORDER BY ike.created_at DESC
  `;

  const stmt = c.env.DB.prepare(sql);

  const result = locationId
    ? await stmt.bind(locationId).all()
    : await stmt.all();

  const rows = result.results ?? [];

  const csv = [[
    'FECHA',
    'MOVIMIENTO',
    'TIPO',
    'CENTRO',
    'CODIGO',
    'PRODUCTO',
    'LOTE',
    'ENTRADA',
    'SALIDA',
    'SALDO',
    'VALOR_SALDO'
  ].join(',')];

  for (const r of rows) {
    csv.push([
      `"${r.created_at ?? ''}"`,
      `"${r.movement_number ?? ''}"`,
      `"${r.entry_type ?? ''}"`,
      `"${r.location_name ?? ''}"`,
      `"${r.sku ?? ''}"`,
      `"${String(r.item_name ?? '').replace(/"/g, '""')}"`,
      `"${r.lot_id ?? ''}"`,
      r.quantity_in ?? 0,
      r.quantity_out ?? 0,
      r.balance_quantity ?? 0,
      r.balance_total_value ?? 0
    ].join(','));
  }

  return new Response(csv.join('\n'), {
    headers: {
      'Content-Type': 'text/csv;charset=utf-8',
      'Content-Disposition': 'attachment; filename="kardex.csv"'
    }
  });
});

router.get('/kardex', async (c) => {
  const itemId = c.req.query('item_id');
  const locationId = c.req.query('location_id');
  const entryType = c.req.query('entry_type');   // IN | OUT
  const fromDate = c.req.query('from_date');       // YYYY-MM-DD
  const toDate = c.req.query('to_date');           // YYYY-MM-DD
  const movNum = (c.req.query('movement_number') || '').trim();
  const q = (c.req.query('q') || '').trim();       // buscar por item sku/nombre
  const limit = Math.min(Number(c.req.query('limit') || 200), 500);
  const offset = Number(c.req.query('offset') || 0);

  const where: string[] = [];
  const params: unknown[] = [];

  if (itemId) { where.push('k.item_id = ?'); params.push(itemId); }
  if (locationId) { where.push('k.location_id = ?'); params.push(locationId); }
  if (entryType) { where.push('k.entry_type = ?'); params.push(entryType); }
  if (fromDate) { where.push("date(k.created_at) >= ?"); params.push(fromDate); }
  if (toDate) { where.push("date(k.created_at) <= ?"); params.push(toDate); }
    if (movNum) { where.push('m.movement_number LIKE ?'); params.push('%' + movNum + '%'); }
  if (q) {
    where.push('(i.sku LIKE ? OR i.name LIKE ?)');
    params.push('%' + q + '%', '%' + q + '%');
  }

  const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const countSql = `
    SELECT COUNT(*) as total
    FROM inventory_kardex_entries k
    JOIN inventory_movements m ON m.id = k.movement_id
    JOIN inventory_items i ON i.id = k.item_id
    JOIN inventory_locations loc ON loc.id = k.location_id
    LEFT JOIN inventory_lots lot ON lot.id = k.lot_id
    ${whereClause}
  `;
  const countRow = await c.env.DB.prepare(countSql).bind(...params).first<{ total: number }>();

  const sql = `
    SELECT
      k.id,
      k.created_at,
      k.entry_type,
      k.location_id,
      COALESCE(loc.name, k.location_id) AS location_name,
      k.item_id,
      i.sku,
      i.name AS item_name,
      i.unit,
      k.lot_id,
      COALESCE(lot.lot_code, '') AS lot_code,
      lot.expiration_date,
      k.quantity_in,
      k.quantity_out,
      k.unit_cost,
      k.total_cost,
      k.balance_quantity,
      k.balance_unit_cost,
      k.balance_total_value,
      m.movement_number,
      m.movement_type,
      m.reference_type,
      m.reference_number,
      m.notes AS movement_notes,
      m.created_by_name
    FROM inventory_kardex_entries k
    JOIN inventory_movements m ON m.id = k.movement_id
    JOIN inventory_items i ON i.id = k.item_id
    JOIN inventory_locations loc ON loc.id = k.location_id
    LEFT JOIN inventory_lots lot ON lot.id = k.lot_id
    ${whereClause}
    ORDER BY k.created_at DESC
    LIMIT ? OFFSET ?
  `;

  const rows = await c.env.DB.prepare(sql).bind(...params, limit, offset).all();

  return c.json({
    data: rows.results ?? [],
    total: Number(countRow?.total ?? 0),
    limit,
    offset,
  });
});

export default router;
