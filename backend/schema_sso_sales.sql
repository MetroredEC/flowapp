-- ============================================================
-- SSO Sales Module - Embudo de Ventas
-- Tabla para seguimiento de oportunidades de venta
-- ============================================================

CREATE TABLE IF NOT EXISTS sso_sales (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  empresa TEXT NOT NULL,
  contacto_nombre TEXT NOT NULL,
  contacto_correo TEXT NOT NULL,
  contacto_telefono TEXT NOT NULL,
  monto_venta REAL NOT NULL DEFAULT 0,
  numero_contrato TEXT,
  numero_cotizacion TEXT,
  servicio_contratado TEXT,
  fecha_inicio TEXT,
  estado TEXT NOT NULL DEFAULT 'prospecto' CHECK (estado IN ('prospecto', 'negociacion', 'propuesta', 'cerrado_ganado', 'cerrado_perdido')),
  probabilidad INTEGER NOT NULL DEFAULT 0 CHECK (probabilidad >= 0 AND probabilidad <= 100),
  observaciones TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_sso_sales_estado ON sso_sales(estado);
CREATE INDEX IF NOT EXISTS idx_sso_sales_empresa ON sso_sales(empresa);
CREATE INDEX IF NOT EXISTS idx_sso_sales_created_at ON sso_sales(created_at);

-- Trigger para actualizar updated_at
CREATE TRIGGER IF NOT EXISTS sso_sales_update_timestamp
AFTER UPDATE ON sso_sales
BEGIN
  UPDATE sso_sales SET updated_at = datetime('now') WHERE id = NEW.id;
END;

-- ============================================================
-- Seed de datos de ejemplo
-- ============================================================

INSERT OR IGNORE INTO sso_sales (id, empresa, contacto_nombre, contacto_correo, contacto_telefono, monto_venta, numero_contrato, numero_cotizacion, servicio_contratado, fecha_inicio, estado, probabilidad, observaciones, created_by) VALUES
  ('sale001', 'Seguros Integral', 'Juan Pérez', 'juan@seguros.com', '+593 999 123456', 50000, 'CT-2024-001', 'CZ-2024-001', 'Medicina prepagada', '2024-07-15', 'cerrado_ganado', 100, 'Cliente satisfecho con condiciones', 'system'),
  ('sale002', 'Corporación Financiera', 'María García', 'maria@financiera.com', '+593 988 654321', 75000, 'CT-2024-002', 'CZ-2024-002', 'Salud ocupacional', '2024-08-01', 'propuesta', 80, 'En revisión legal', 'system'),
  ('sale003', 'Constructora Moderna', 'Carlos López', 'carlos@constructora.com', '+593 992 111222', 120000, '', 'CZ-2024-003', 'Convenio empresarial', '2024-09-01', 'negociacion', 60, 'Esperando respuesta sobre términos de pago', 'system'),
  ('sale004', 'Tech Solutions Inc', 'Andrea Rodríguez', 'andrea@techsolutions.com', '+593 985 555666', 0, '', '', '', '', 'prospecto', 20, 'Contacto inicial, requiere seguimiento', 'system');

SELECT 'SSO Sales schema created successfully' AS result;
