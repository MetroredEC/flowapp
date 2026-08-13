INSERT INTO inventory_movements (
  id, movement_number, movement_type, status, source_location_id, target_location_id
)
VALUES (
  '7ac7ed03-170a-4184-8b71-b0f77889d2ce',
  'TRF-' || strftime('%Y%m%d%H%M%S','now'),
  'TRANSFER',
  'draft',
  'loc-bod1',
  'loc-bod2'
);

INSERT INTO inventory_movement_lines (
  id, movement_id, item_id, quantity, unit_cost, total_cost
)
VALUES (
  '8e498d13-947b-4584-a359-61e9d5403653',
  '7ac7ed03-170a-4184-8b71-b0f77889d2ce',
  'item-med-001',
  30,
  0,
  0
);
