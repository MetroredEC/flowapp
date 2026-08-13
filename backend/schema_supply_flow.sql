CREATE TABLE IF NOT EXISTS supply_requests (
  id TEXT PRIMARY KEY,
  request_number TEXT NOT NULL UNIQUE,
  center_location_id TEXT NOT NULL,
  requester_email TEXT NOT NULL,
  requester_name TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  justification TEXT,
  required_date TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  approved_at TEXT,
  dispatched_at TEXT,
  received_at TEXT,

  FOREIGN KEY(center_location_id)
    REFERENCES inventory_locations(id)
);

CREATE TABLE IF NOT EXISTS supply_request_lines (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  quantity_requested REAL NOT NULL,
  quantity_approved REAL,
  notes TEXT,

  FOREIGN KEY(request_id)
    REFERENCES supply_requests(id),

  FOREIGN KEY(item_id)
    REFERENCES inventory_items(id)
);

CREATE TABLE IF NOT EXISTS supply_dispatch_lines (
  id TEXT PRIMARY KEY,
  request_line_id TEXT NOT NULL,
  quantity_dispatched REAL NOT NULL,
  lot_id TEXT,
  expiration_date TEXT,
  dispatched_by_email TEXT,
  dispatched_at TEXT DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY(request_line_id)
    REFERENCES supply_request_lines(id),

  FOREIGN KEY(lot_id)
    REFERENCES inventory_lots(id)
);

CREATE TABLE IF NOT EXISTS supply_receipt_lines (
  id TEXT PRIMARY KEY,
  dispatch_line_id TEXT NOT NULL,
  quantity_received REAL NOT NULL,
  received_by_email TEXT,
  received_at TEXT DEFAULT CURRENT_TIMESTAMP,
  discrepancy_notes TEXT,

  FOREIGN KEY(dispatch_line_id)
    REFERENCES supply_dispatch_lines(id)
);

CREATE TABLE IF NOT EXISTS daily_consumptions (
  id TEXT PRIMARY KEY,
  center_location_id TEXT NOT NULL,
  consumed_by_email TEXT NOT NULL,
  consumption_date TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY(center_location_id)
    REFERENCES inventory_locations(id)
);

CREATE TABLE IF NOT EXISTS daily_consumption_lines (
  id TEXT PRIMARY KEY,
  daily_consumption_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  lot_id TEXT,
  quantity REAL NOT NULL,
  reason TEXT NOT NULL,

  FOREIGN KEY(daily_consumption_id)
    REFERENCES daily_consumptions(id),

  FOREIGN KEY(item_id)
    REFERENCES inventory_items(id),

  FOREIGN KEY(lot_id)
    REFERENCES inventory_lots(id)
);
