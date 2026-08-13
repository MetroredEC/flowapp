INSERT INTO inventory_movements (
  id, movement_number, movement_type, status, source_location_id
)
VALUES (
  '7ffae301-cf76-4b9a-bb03-a441178da039',
  'OUT-' || strftime('%Y%m%d%H%M%S','now'),
  'OUT',
  'draft',
  'loc-bod1'
);

INSERT INTO inventory_movement_lines (
  id, movement_id, item_id, quantity, unit_cost, total_cost
)
VALUES (
  '59fcb609-e0fd-41c5-864b-e06e3c470e5d',
  '7ffae301-cf76-4b9a-bb03-a441178da039',
  'item-med-001',
  20,
  0,
  0
);
