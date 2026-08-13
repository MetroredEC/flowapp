-- ============================================================
-- FLOWAPP: Proceso completo de Compra de Material POP
-- Con confirmacion de recepcion por el solicitante
-- Ejecutar con:
--   npx wrangler d1 execute flowapp-db --env production --remote --file seed_pop_flow.sql
-- ============================================================

-- Tipo de solicitud (INSERT OR IGNORE para no duplicar)
INSERT OR IGNORE INTO request_types (id, name, description, is_active) VALUES (
  'pop-compra',
  'Compra de Material POP',
  'Adquisicion de material publicitario y merchandising. Requiere factura del proveedor y confirmacion de recepcion por el solicitante.',
  1
);

-- Flujo de 3 niveles:
--   1. Coordinacion de Marketing  → revisa la necesidad y el brief
--   2. Gerencia Administrativa     → aprueba el presupuesto
--   3. Solicitante (__requester__) → confirma la recepcion del material
INSERT OR IGNORE INTO flow_configs (id, request_type_id, level, label, approver_type, approver_value) VALUES
  ('fc-pop-1', 'pop-compra', 1, 'Coordinacion de Marketing', 'job_title', 'Coordinador de Marketing'),
  ('fc-pop-2', 'pop-compra', 2, 'Gerencia Administrativa',   'job_title', 'Gerente Administrativo'),
  ('fc-pop-3', 'pop-compra', 3, 'Recepcion de material',     'job_title', '__requester__');

SELECT 'Proceso POP creado' AS result, COUNT(*) AS niveles
FROM flow_configs WHERE request_type_id = 'pop-compra';
