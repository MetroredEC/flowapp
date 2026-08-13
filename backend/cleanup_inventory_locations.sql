DELETE FROM inventory_locations
WHERE id IN (
  'loc-bod1',
  'loc-bod2'
);

INSERT OR IGNORE INTO inventory_locations (
  id,
  code,
  name
)
VALUES (
  'loc-admin',
  'ADMINISTRACION',
  'ADMINISTRACIÓN'
);
