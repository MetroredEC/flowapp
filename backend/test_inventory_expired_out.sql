INSERT INTO inventory_movements (
  id,
  movement_number,
  movement_type,
  status,
  source_location_id
)
VALUES (
  'b1621804-7a8d-414f-93b2-92b3a016cd38',
  'OUTEXP-' || strftime('%Y%m%d%H%M%S','now'),
  'OUT',
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
  'ece61dd7-01d5-4494-90c0-965cab906b47',
  'b1621804-7a8d-414f-93b2-92b3a016cd38',
  'item-med-001',
  'lot-med-001-exp',
  1,
  0,
  0
);
