import { AppEnv } from "../types";

type Env = AppEnv["Bindings"];

type InventoryMovement = {
 id: string;
 movement_type: string;
 status: string;
 source_location_id: string | null;
 target_location_id: string | null;
};

type InventoryLine = {
 id: string;
 item_id: string;
 lot_id: string | null;
 quantity: number;
 unit_cost: number;
 total_cost: number;
};

type StockBalance = {
 id: string;
 quantity_on_hand: number;
 average_cost: number;
 total_value: number;
};

type LotInfo = {
 id: string;
 lot_code: string;
 expiration_date: string | null;
};

export async function postMovement(movementId: string, env: Env): Promise<void> {
 const db = env.DB;

 const movement = await db.prepare(`
  SELECT id, movement_type, status, source_location_id, target_location_id
  FROM inventory_movements
  WHERE id = ?
 `).bind(movementId).first<InventoryMovement>();

 if (!movement) throw new Error("Movimiento no encontrado");
 if (movement.status !== "draft") throw new Error("Ya procesado");

 const lines = await db.prepare(`
  SELECT id, item_id, lot_id, quantity, unit_cost, total_cost
  FROM inventory_movement_lines
  WHERE movement_id = ?
 `).bind(movementId).all<InventoryLine>();

 if (!lines.results?.length) throw new Error("Movimiento sin lineas");

 if (movement.movement_type === "IN") {
  if (!movement.target_location_id) throw new Error("Entrada requiere bodega destino");

  for (const line of lines.results) {
   await applyIn(movement.id, movement.target_location_id, line, env);
  }
 } else if (movement.movement_type === "OUT") {
  if (!movement.source_location_id) throw new Error("Salida requiere bodega origen");

  for (const line of lines.results) {
   await applyOut(movement.id, movement.source_location_id, line, env);
  }
 } else if (movement.movement_type === "TRANSFER") {
  if (!movement.source_location_id) throw new Error("Transferencia requiere bodega origen");
  if (!movement.target_location_id) throw new Error("Transferencia requiere bodega destino");
  if (movement.source_location_id === movement.target_location_id) {
   throw new Error("Origen y destino no pueden ser iguales");
  }

  for (const line of lines.results) {
   const outResult = await applyOut(movement.id, movement.source_location_id, line, env);

   await applyIn(movement.id, movement.target_location_id, {
   ...line,
    unit_cost: outResult.unitCost,
    total_cost: outResult.totalCost,
   }, env);
  }
 } else {
  throw new Error("Tipo de movimiento no soportado: " + movement.movement_type);
 }

 await db.prepare(`
  UPDATE inventory_movements
  SET status = 'posted',
    posted_at = datetime('now')
  WHERE id = ?
 `).bind(movement.id).run();
}

async function applyIn(
 movementId: string,
 locationId: string,
 line: InventoryLine,
 env: Env
): Promise<void> {
 const qty = Number(line.quantity);
 const unitCost = Number(line.unit_cost);
 const totalCost = Number(line.total_cost || qty * unitCost);

 if (qty <= 0) throw new Error("Cantidad invalida");
 if (unitCost < 0) throw new Error("Costo invalido");

 const existing = await getBalance(locationId, line.item_id, line.lot_id, env);

 const oldQty = Number(existing?.quantity_on_hand ?? 0);
 const oldAvg = Number(existing?.average_cost ?? 0);
 const oldValue = oldQty * oldAvg;

 const newQty = oldQty + qty;
 const newValue = oldValue + totalCost;
 const newAvg = newQty > 0 ? newValue / newQty: unitCost;

 await upsertBalance(locationId, line.item_id, line.lot_id, newQty, newAvg, newValue, existing?.id, env);

 await insertKardex({
  movementId,
  lineId: line.id,
  locationId,
  itemId: line.item_id,
  lotId: line.lot_id,
  entryType: "IN",
  quantityIn: qty,
  quantityOut: 0,
  unitCost,
  totalCost,
  balanceQty: newQty,
  balanceUnitCost: newAvg,
  balanceTotalValue: newValue,
  env,
 });
}

async function applyOut(
 movementId: string,
 locationId: string,
 line: InventoryLine,
 env: Env
): Promise<{ unitCost: number; totalCost: number }> {

 const qty = Number(line.quantity);

 if (qty <= 0) {
  throw new Error("Cantidad invalida");
 }

 // FEFO AUTO
 if (!line.lot_id) {
  return applyOutFefo(
   movementId,
   locationId,
   line,
   env
  );
 }

 await validateLotForOutput(line.item_id, line.lot_id, env);

 const existing = await getBalance(locationId, line.item_id, line.lot_id, env);

 if (!existing) {
  throw new Error("No hay stock para el item " + line.item_id);
 }

 const oldQty = Number(existing.quantity_on_hand);
 const avgCost = Number(existing.average_cost);

 if (qty > oldQty) {
  throw new Error(`Stock insuficiente. Disponible: ${oldQty}, requerido: ${qty}`);
 }

 const newQty = oldQty - qty;
 const totalCost = qty * avgCost;
 const newValue = newQty * avgCost;

 await upsertBalance(locationId, line.item_id, line.lot_id, newQty, avgCost, newValue, existing.id, env);

 await insertKardex({
  movementId,
  lineId: line.id,
  locationId,
  itemId: line.item_id,
  lotId: line.lot_id,
  entryType: "OUT",
  quantityIn: 0,
  quantityOut: qty,
  unitCost: avgCost,
  totalCost,
  balanceQty: newQty,
  balanceUnitCost: avgCost,
  balanceTotalValue: newValue,
  env,
 });

 return { unitCost: avgCost, totalCost };
}


async function applyOutFefo(
 movementId: string,
 locationId: string,
 line: InventoryLine,
 env: Env
): Promise<{ unitCost: number; totalCost: number }> {

 const qtyNeeded = Number(line.quantity);

 const lots = await env.DB.prepare(`
  SELECT
   b.lot_id,
   b.quantity_on_hand,
   b.average_cost,
   l.expiration_date
  FROM inventory_stock_balances b
  JOIN inventory_lots l
   ON l.id = b.lot_id
  WHERE b.location_id = ?
   AND b.item_id = ?
   AND b.quantity_on_hand > 0
   AND l.expiration_date >= date('now')
  ORDER BY l.expiration_date ASC
 `).bind(
  locationId,
  line.item_id
 ).all<{ lot_id: string; quantity_on_hand: number; average_cost: number; expiration_date: string }>();

 if (!lots.results.length) {
  throw new Error("No hay lotes vigentes disponibles");
 }

 let remaining = qtyNeeded;

 for (const lot of lots.results) {
  if (remaining <= 0) break;

  const available = Number(lot.quantity_on_hand);
  if (available <= 0) continue;

  const consumeQty = Math.min(remaining, available);

  await applyOut(
   movementId,
   locationId,
   {
   ...line,
    lot_id: String(lot.lot_id),
    quantity: consumeQty,
   },
   env
  );

  remaining -= consumeQty;
 }

 if (remaining > 0) {
  throw new Error("Stock insuficiente FEFO. Faltan: " + remaining);
 }

 return { unitCost: 0, totalCost: 0 };
}
async function validateLotForOutput(
 itemId: string,
 lotId: string | null,
 env: Env
): Promise<void> {
 if (!lotId) return;

 const lot = await env.DB.prepare(`
  SELECT id, lot_code, expiration_date
  FROM inventory_lots
  WHERE id = ?
   AND item_id = ?
  LIMIT 1
 `).bind(lotId, itemId).first<LotInfo>();

 if (!lot) throw new Error("Lote no encontrado");

 if (lot.expiration_date) {
  const today = new Date().toISOString().slice(0, 10);
  if (lot.expiration_date < today) {
   throw new Error("Lote vencido bloqueado: " + lot.lot_code);
  }
 }
}
async function getBalance(
 locationId: string,
 itemId: string,
 lotId: string | null,
 env: Env
): Promise<StockBalance | null> {
 return env.DB.prepare(`
  SELECT id, quantity_on_hand, average_cost, total_value
  FROM inventory_stock_balances
  WHERE location_id = ?
   AND item_id = ?
   AND COALESCE(lot_id, '') = COALESCE(?, '')
  LIMIT 1
 `).bind(locationId, itemId, lotId).first<StockBalance>();
}

async function upsertBalance(
 locationId: string,
 itemId: string,
 lotId: string | null,
 quantity: number,
 averageCost: number,
 totalValue: number,
 existingId: string | undefined,
 env: Env
): Promise<void> {
 if (existingId) {
  await env.DB.prepare(`
   UPDATE inventory_stock_balances
   SET quantity_on_hand = ?,
     average_cost = ?,
     total_value = ?,
     updated_at = datetime('now')
   WHERE id = ?
  `).bind(quantity, averageCost, totalValue, existingId).run();
  return;
 }

 await env.DB.prepare(`
  INSERT INTO inventory_stock_balances (
   id, location_id, item_id, lot_id, quantity_on_hand, average_cost, total_value
  )
  VALUES (?, ?, ?, ?, ?, ?, ?)
 `).bind(
  crypto.randomUUID(),
  locationId,
  itemId,
  lotId,
  quantity,
  averageCost,
  totalValue
 ).run();
}

async function insertKardex(input: {
 movementId: string;
 lineId: string;
 locationId: string;
 itemId: string;
 lotId: string | null;
 entryType: "IN" | "OUT";
 quantityIn: number;
 quantityOut: number;
 unitCost: number;
 totalCost: number;
 balanceQty: number;
 balanceUnitCost: number;
 balanceTotalValue: number;
 env: Env;
}): Promise<void> {
 await input.env.DB.prepare(`
  INSERT INTO inventory_kardex_entries (
   id, movement_id, movement_line_id, location_id, item_id, lot_id,
   entry_type, quantity_in, quantity_out, unit_cost, total_cost,
   balance_quantity, balance_unit_cost, balance_total_value
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
 `).bind(
  crypto.randomUUID(),
  input.movementId,
  input.lineId,
  input.locationId,
  input.itemId,
  input.lotId,
  input.entryType,
  input.quantityIn,
  input.quantityOut,
  input.unitCost,
  input.totalCost,
  input.balanceQty,
  input.balanceUnitCost,
  input.balanceTotalValue
 ).run();
}
