UPDATE inventory_stock_balances
SET location_id = 'loc-admin'
WHERE location_id IN ('loc-bod1', 'loc-bod2');

UPDATE inventory_kardex_entries
SET location_id = 'loc-admin'
WHERE location_id IN ('loc-bod1', 'loc-bod2');

UPDATE inventory_movements
SET source_location_id = 'loc-admin'
WHERE source_location_id IN ('loc-bod1', 'loc-bod2');

UPDATE inventory_movements
SET target_location_id = 'loc-admin'
WHERE target_location_id IN ('loc-bod1', 'loc-bod2');
