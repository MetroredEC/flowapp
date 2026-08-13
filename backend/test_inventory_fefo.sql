INSERT INTO inventory_movements (
  id, movement_number, movement_type, status, source_location_id
)
VALUES (
  'b4cca8da-6886-42e1-be61-e0b2f42abf98',
  'FEFO-' || strftime('%Y%m%d%H%M%S','now'),
  'OUT',
  'draft',
  'loc-bod1'
);

INSERT INTO inventory_movement_lines (
  id, movement_id, item_id, lot_id, quantity, unit_cost, total_cost
)
VALUES (
  'b6456bfa-31fc-4ae3-a4ef-1afe7f730cbb',
  'b4cca8da-6886-42e1-be61-e0b2f42abf98',
  'item-med-001',
  NULL,
  20,
  0,
  0
);
