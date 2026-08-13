INSERT INTO inventory_movements (
  id, movement_number, movement_type, status, target_location_id
)
VALUES (
  '2699e7cc-673a-4061-a144-53862bb21823',
  'MOV-' || strftime('%Y%m%d%H%M%S','now'),
  'IN',
  'draft',
  'loc-bod1'
);

INSERT INTO inventory_movement_lines (
  id, movement_id, item_id, quantity, unit_cost, total_cost
)
VALUES (
  '3afb90dd-3ebb-40b1-a690-6393770c0054',
  '2699e7cc-673a-4061-a144-53862bb21823',
  'item-med-001',
  100,
  2.5,
  250
);
