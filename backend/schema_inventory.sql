-- =====================================================
-- INVENTORY CORE SCHEMA
-- =====================================================

CREATE TABLE IF NOT EXISTS inventory_locations (
 id TEXT PRIMARY KEY,
 code TEXT NOT NULL UNIQUE,
 name TEXT NOT NULL,
 description TEXT,
 is_active INTEGER NOT NULL DEFAULT 1,
 created_at TEXT DEFAULT (datetime('now')),
 updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS inventory_items (
 id TEXT PRIMARY KEY,
 sku TEXT NOT NULL UNIQUE,
 barcode TEXT,
 name TEXT NOT NULL,
 description TEXT,
 unit TEXT NOT NULL DEFAULT 'unidad',
 category TEXT,
 requires_lot INTEGER NOT NULL DEFAULT 0,
 requires_expiration INTEGER NOT NULL DEFAULT 0,
 costing_method TEXT NOT NULL DEFAULT 'weighted_average',
 min_stock REAL NOT NULL DEFAULT 0,
 is_active INTEGER NOT NULL DEFAULT 1,
 created_at TEXT DEFAULT (datetime('now')),
 updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS inventory_lots (
 id TEXT PRIMARY KEY,
 item_id TEXT NOT NULL,
 lot_code TEXT NOT NULL,
 expiration_date TEXT,
 manufacture_date TEXT,
 notes TEXT,
 created_at TEXT DEFAULT (datetime('now')),
 FOREIGN KEY (item_id) REFERENCES inventory_items(id),
 UNIQUE(item_id, lot_code)
);

CREATE TABLE IF NOT EXISTS inventory_movements (
 id TEXT PRIMARY KEY,
 movement_number TEXT NOT NULL UNIQUE,
 movement_type TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'draft',
 source_location_id TEXT,
 target_location_id TEXT,
 reference_type TEXT,
 reference_number TEXT,
 notes TEXT,
 created_by_id TEXT,
 created_by_name TEXT,
 created_by_email TEXT,
 approved_by_id TEXT,
 approved_by_name TEXT,
 approved_by_email TEXT,
 approved_at TEXT,
 created_at TEXT DEFAULT (datetime('now')),
 posted_at TEXT,
 FOREIGN KEY (source_location_id) REFERENCES inventory_locations(id),
 FOREIGN KEY (target_location_id) REFERENCES inventory_locations(id)
);

CREATE TABLE IF NOT EXISTS inventory_movement_lines (
 id TEXT PRIMARY KEY,
 movement_id TEXT NOT NULL,
 item_id TEXT NOT NULL,
 lot_id TEXT,
 quantity REAL NOT NULL,
 unit_cost REAL NOT NULL DEFAULT 0,
 total_cost REAL NOT NULL DEFAULT 0,
 notes TEXT,
 created_at TEXT DEFAULT (datetime('now')),
 FOREIGN KEY (movement_id) REFERENCES inventory_movements(id),
 FOREIGN KEY (item_id) REFERENCES inventory_items(id),
 FOREIGN KEY (lot_id) REFERENCES inventory_lots(id)
);

CREATE TABLE IF NOT EXISTS inventory_stock_balances (
 id TEXT PRIMARY KEY,
 location_id TEXT NOT NULL,
 item_id TEXT NOT NULL,
 lot_id TEXT,
 quantity_on_hand REAL NOT NULL DEFAULT 0,
 average_cost REAL NOT NULL DEFAULT 0,
 total_value REAL NOT NULL DEFAULT 0,
 updated_at TEXT DEFAULT (datetime('now')),
 FOREIGN KEY (location_id) REFERENCES inventory_locations(id),
 FOREIGN KEY (item_id) REFERENCES inventory_items(id),
 FOREIGN KEY (lot_id) REFERENCES inventory_lots(id),
 UNIQUE(location_id, item_id, lot_id)
);

CREATE TABLE IF NOT EXISTS inventory_kardex_entries (
 id TEXT PRIMARY KEY,
 movement_id TEXT NOT NULL,
 movement_line_id TEXT NOT NULL,
 location_id TEXT NOT NULL,
 item_id TEXT NOT NULL,
 lot_id TEXT,
 entry_type TEXT NOT NULL,
 quantity_in REAL NOT NULL DEFAULT 0,
 quantity_out REAL NOT NULL DEFAULT 0,
 unit_cost REAL NOT NULL DEFAULT 0,
 total_cost REAL NOT NULL DEFAULT 0,
 balance_quantity REAL NOT NULL DEFAULT 0,
 balance_unit_cost REAL NOT NULL DEFAULT 0,
 balance_total_value REAL NOT NULL DEFAULT 0,
 created_at TEXT DEFAULT (datetime('now')),
 FOREIGN KEY (movement_id) REFERENCES inventory_movements(id),
 FOREIGN KEY (movement_line_id) REFERENCES inventory_movement_lines(id),
 FOREIGN KEY (location_id) REFERENCES inventory_locations(id),
 FOREIGN KEY (item_id) REFERENCES inventory_items(id),
 FOREIGN KEY (lot_id) REFERENCES inventory_lots(id)
);

CREATE TABLE IF NOT EXISTS inventory_attachments (
 id TEXT PRIMARY KEY,
 movement_id TEXT NOT NULL,
 filename TEXT NOT NULL,
 content_type TEXT,
 size_bytes INTEGER,
 r2_key TEXT NOT NULL,
 uploaded_by_id TEXT,
 uploaded_by_name TEXT,
 uploaded_by_email TEXT,
 created_at TEXT DEFAULT (datetime('now')),
 FOREIGN KEY (movement_id) REFERENCES inventory_movements(id)
);

CREATE TABLE IF NOT EXISTS inventory_audit_log (
 id TEXT PRIMARY KEY,
 entity_type TEXT NOT NULL,
 entity_id TEXT NOT NULL,
 action TEXT NOT NULL,
 old_json TEXT,
 new_json TEXT,
 actor_id TEXT,
 actor_name TEXT,
 actor_email TEXT,
 ip_address TEXT,
 user_agent TEXT,
 created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_inventory_items_sku ON inventory_items(sku);
CREATE INDEX IF NOT EXISTS idx_inventory_items_barcode ON inventory_items(barcode);
CREATE INDEX IF NOT EXISTS idx_inventory_lots_item ON inventory_lots(item_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_type ON inventory_movements(movement_type);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_status ON inventory_movements(status);
CREATE INDEX IF NOT EXISTS idx_inventory_lines_movement ON inventory_movement_lines(movement_id);
CREATE INDEX IF NOT EXISTS idx_inventory_stock_location_item ON inventory_stock_balances(location_id, item_id);
CREATE INDEX IF NOT EXISTS idx_inventory_kardex_item ON inventory_kardex_entries(item_id);
CREATE INDEX IF NOT EXISTS idx_inventory_kardex_location ON inventory_kardex_entries(location_id);
CREATE INDEX IF NOT EXISTS idx_inventory_audit_entity ON inventory_audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_inventory_audit_created ON inventory_audit_log(created_at);
