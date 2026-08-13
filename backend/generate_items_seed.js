const fs = require('fs');

const raw = fs.readFileSync('./productos.csv', 'utf8');

const lines = raw.split(/\r?\n/).filter(x => x.trim());

const sql = [];

for (let i = 1; i < lines.length; i++) {
  const line = lines[i];

  let parts;

  if (line.includes(';')) {
    parts = line.split(';');
  } else {
    parts = line.split(',');
  }

  const code = (parts[0] || '')
    .trim()
    .replace(/^"|"$/g, '');

  const name = (parts[1] || '')
    .trim()
    .replace(/^"|"$/g, '')
    .replace(/'/g, "''");

  const type = (parts[2] || '')
    .trim()
    .replace(/^"|"$/g, '')
    .replace(/'/g, "''");

  if (!code || !name) continue;

  const safeId = code
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');

  const id = 'item-' + safeId;

  sql.push(`
INSERT OR IGNORE INTO inventory_items (
  id,
  sku,
  name,
  unit
) VALUES (
  '${id}',
  '${code}',
  '${name}',
  'unidad'
);`);
}

fs.writeFileSync(
  './inventory_items_seed.sql',
  sql.join('\n')
);

console.log('Productos:', sql.length);
