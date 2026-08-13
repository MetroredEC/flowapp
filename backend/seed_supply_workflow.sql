INSERT OR REPLACE INTO process_definitions (
  id,
  key,
  name,
  description,
  version,
  status
)
VALUES (
  'suministros-001',
  'suministros',
  'Solicitud de suministros',
  'Flujo operativo de suministros y kardex',
  1,
  'active'
);

DELETE FROM workflow_nodes
WHERE process_definition_id = 'suministros-001';

DELETE FROM workflow_edges
WHERE process_definition_id = 'suministros-001';

INSERT INTO workflow_nodes (
  id,
  process_definition_id,
  node_key,
  type,
  label,
  config_json,
  position_x,
  position_y
)
VALUES

(
  'sum-start',
  'suministros-001',
  'start',
  'start',
  'Inicio',
  NULL,
  0,
  0
),

(
  'sum-compras',
  'suministros-001',
  'compras',
  'task',
  'Compras recibe y cotiza',
  '{"assign":{"type":"email","value":"compras@metrored.med.ec"}}',
  200,
  0
),

(
  'sum-contabilidad',
  'suministros-001',
  'contabilidad',
  'task',
  'Contabilidad valida presupuesto',
  '{"assign":{"type":"email","value":"contabilidad@metrored.med.ec"}}',
  400,
  0
),

(
  'sum-despacho',
  'suministros-001',
  'despacho',
  'task',
  'Compras despacha productos',
  '{"assign":{"type":"email","value":"compras@metrored.med.ec"}}',
  600,
  0
),

(
  'sum-validacion',
  'suministros-001',
  'validacion',
  'task',
  'Supervisora valida despacho',
  '{"assign":{"type":"requester"}}',
  800,
  0
),

(
  'sum-recepcion',
  'suministros-001',
  'recepcion',
  'task',
  'Supervisora registra recepción real',
  '{"assign":{"type":"requester"}}',
  1000,
  0
),

(
  'sum-final',
  'suministros-001',
  'end',
  'end',
  'Carga automática a Kardex',
  NULL,
  1200,
  0
);

INSERT INTO workflow_edges (
  id,
  process_definition_id,
  source_node_id,
  target_node_id,
  label
)
VALUES

(
  'edge-1',
  'suministros-001',
  'sum-start',
  'sum-compras',
  'Enviar'
),

(
  'edge-2',
  'suministros-001',
  'sum-compras',
  'sum-contabilidad',
  'Cotizado'
),

(
  'edge-3',
  'suministros-001',
  'sum-contabilidad',
  'sum-despacho',
  'Aprobado'
),

(
  'edge-4',
  'suministros-001',
  'sum-despacho',
  'sum-validacion',
  'Despachado'
),

(
  'edge-5',
  'suministros-001',
  'sum-validacion',
  'sum-recepcion',
  'Validado'
),

(
  'edge-6',
  'suministros-001',
  'sum-recepcion',
  'sum-final',
  'Recibido'
);
