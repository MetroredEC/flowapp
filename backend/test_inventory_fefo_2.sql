INSERT INTO inventory_movements (
  id, movement_number, movement_type, status, source_location_id
)
VALUES (
  '24620559-11f0-4160-82a5-fb7089fa5e21',
  'FEFO-' || strftime('%Y%m%d%H%M%S','now'),
  'OUT',
  'draft',
  'loc-bod1'
);

INSERT INTO inventory_movement_lines (
  id, movement_id, item_id, lot_id, quantity, unit_cost, total_cost
)
VALUES (
  '0074edd7-7fcb-43a9-8362-eec5f428a875',
  '24620559-11f0-4160-82a5-fb7089fa5e21',
  'item-med-001',
  NULL,
  20,
  0,
  0
);
