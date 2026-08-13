INSERT INTO inventory_movements (
  id,
  movement_number,
  movement_type,
  status,
  target_location_id
)
VALUES (
  'e842e41c-7948-4bb1-913b-2b0934fbe0f5',
  'INLOT-' || strftime('%Y%m%d%H%M%S','now'),
  'IN',
  'draft',
  'loc-bod1'
);

INSERT INTO inventory_movement_lines (
  id,
  movement_id,
  item_id,
  lot_id,
  quantity,
  unit_cost,
  total_cost
)
VALUES (
  '7d387a63-55ab-40a7-8dee-5c0406078bdc',
  'e842e41c-7948-4bb1-913b-2b0934fbe0f5',
  'item-med-001',
  'lot-med-001-ok',
  40,
  3,
  120
);
