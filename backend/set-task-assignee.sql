UPDATE workflow_nodes
  SET config_json = '{"assign":{"type":"email","value":"proyectos@metrored.med.ec"}}'
 WHERE node_key = 'revision'
  AND process_definition_id = 'compras-001';
