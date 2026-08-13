INSERT INTO inventory_stock_balances (
  id, location_id, item_id, lot_id, quantity_on_hand, average_cost, total_value, updated_at
)
VALUES (
  lower(hex(randomblob(16))),
  'loc-bod1',
  'item-med-001',
  NULL,
  100,
  2.5,
  250,
  datetime('now')
);

INSERT INTO inventory_kardex_entries (
  id,
  movement_id,
  movement_line_id,
  location_id,
  item_id,
  lot_id,
  entry_type,
  quantity_in,
  quantity_out,
  unit_cost,
  total_cost,
  balance_quantity,
  balance_unit_cost,
  balance_total_value,
  created_at
)
SELECT
  lower(hex(randomblob(16))),
  m.id,
  l.id,
  m.target_location_id,
  l.item_id,
  l.lot_id,
  'IN',
  l.quantity,
  0,
  l.unit_cost,
  l.total_cost,
  100,
  2.5,
  250,
  datetime('now')
FROM inventory_movements m
JOIN inventory_movement_lines l ON l.movement_id = m.id
WHERE m.id = '2699e7cc-673a-4061-a144-53862bb21823';

UPDATE inventory_movements
   SET status = 'posted',
       posted_at = datetime('now')
 WHERE id = '2699e7cc-673a-4061-a144-53862bb21823';
