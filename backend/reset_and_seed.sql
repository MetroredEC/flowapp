-- ============================================================
-- FLOWAPP: LIMPIEZA COMPLETA + FLUJOS COMERCIAL / MARKETING / BI
-- Ejecutar con:
--   npx wrangler d1 execute flowapp-db --env production --file reset_and_seed.sql
-- ============================================================

PRAGMA foreign_keys = OFF;

-- ── 1. LIMPIAR DATOS DE PRUEBA ───────────────────────────────────────────────

DELETE FROM campaign_vendors;
DELETE FROM campaign_costs;
DELETE FROM approval_tokens;
DELETE FROM approval_steps;
DELETE FROM attachments;
DELETE FROM requests;
DELETE FROM audit_log;

-- BPM / Workflow
DELETE FROM task_actions;
DELETE FROM tasks;
DELETE FROM process_instances;
DELETE FROM form_fields;
DELETE FROM form_definitions;
DELETE FROM automation_rules;
DELETE FROM workflow_edges;
DELETE FROM workflow_nodes;
DELETE FROM process_definitions;

-- Tipos y flujos previos
DELETE FROM flow_configs;
DELETE FROM request_types;

PRAGMA foreign_keys = ON;

-- ── 2. TIPOS DE SOLICITUD ────────────────────────────────────────────────────

-- ÁREA COMERCIAL
INSERT INTO request_types (id, name, description, is_active) VALUES
  ('com-propuesta', 'Propuesta Comercial y Contratos',
   'Negociacion y aprobacion de contratos con aseguradoras, empresas y convenios corporativos.',
   1),
  ('com-tarifario', 'Actualizacion de Tarifario',
   'Cambios en tarifas de consultas, procedimientos y servicios medicos por especialidad o centro.',
   1),
  ('com-convenio',  'Convenios y Alianzas Estrategicas',
   'Nuevas alianzas, renovaciones y acuerdos de cooperacion con entidades externas.',
   1);

-- ÁREA MARKETING
INSERT INTO request_types (id, name, description, is_active) VALUES
  ('mkt-campana',   'Campana de Marketing',
   'Campanas publicitarias, activaciones, eventos y comunicacion en medios digitales y tradicionales.',
   1),
  ('mkt-pop',       'Compra de Material POP',
   'Adquisicion de material publicitario: displays, banners, brochures, uniformes y articulados.',
   1),
  ('mkt-contenido', 'Produccion de Contenido',
   'Fotografia, video, diseno grafico y piezas creativas para canales internos y externos.',
   1);

-- ÁREA BI
INSERT INTO request_types (id, name, description, is_active) VALUES
  ('bi-reporte',    'Solicitud de Reporte o Analisis',
   'Reportes de produccion, atencion, facturacion y analisis estadisticos a medida.',
   1),
  ('bi-dashboard',  'Nuevo Dashboard o Visualizacion',
   'Creacion o actualizacion de dashboards interactivos, KPIs y tableros de control.',
   1),
  ('bi-datos',      'Extraccion y Procesamiento de Datos',
   'Exportacion de bases de datos, migraciones, cruces de informacion para campanas o estudios.',
   1);

-- ── 3. FLUJOS DE APROBACIÓN ──────────────────────────────────────────────────
-- approver_type = 'job_title' → el administrador asigna el usuario real desde la plataforma.
-- approver_value = cargo descriptivo (visible en la UI).

-- ─── COMERCIAL: Propuesta Comercial y Contratos (3 niveles) ─────────────────
INSERT INTO flow_configs (id, request_type_id, level, label, approver_type, approver_value) VALUES
  ('fc-com-p-1', 'com-propuesta', 1, 'Coordinacion Comercial',  'job_title', 'Coordinador Comercial'),
  ('fc-com-p-2', 'com-propuesta', 2, 'Gerencia Comercial',      'job_title', 'Gerente Comercial'),
  ('fc-com-p-3', 'com-propuesta', 3, 'Direccion General',       'job_title', 'Director General');

-- ─── COMERCIAL: Actualizacion de Tarifario (2 niveles) ──────────────────────
INSERT INTO flow_configs (id, request_type_id, level, label, approver_type, approver_value) VALUES
  ('fc-com-t-1', 'com-tarifario', 1, 'Gerencia Comercial',      'job_title', 'Gerente Comercial'),
  ('fc-com-t-2', 'com-tarifario', 2, 'Direccion Medica',        'job_title', 'Director Medico');

-- ─── COMERCIAL: Convenios y Alianzas (3 niveles) ────────────────────────────
INSERT INTO flow_configs (id, request_type_id, level, label, approver_type, approver_value) VALUES
  ('fc-com-c-1', 'com-convenio',  1, 'Coordinacion Comercial',  'job_title', 'Coordinador Comercial'),
  ('fc-com-c-2', 'com-convenio',  2, 'Gerencia Comercial',      'job_title', 'Gerente Comercial'),
  ('fc-com-c-3', 'com-convenio',  3, 'Gerencia General',        'job_title', 'Gerente General');

-- ─── MARKETING: Campana de Marketing (2 niveles) ────────────────────────────
INSERT INTO flow_configs (id, request_type_id, level, label, approver_type, approver_value) VALUES
  ('fc-mkt-k-1', 'mkt-campana',   1, 'Coordinacion de Marketing', 'job_title', 'Coordinador de Marketing'),
  ('fc-mkt-k-2', 'mkt-campana',   2, 'Gerencia Comercial',        'job_title', 'Gerente Comercial');

-- ─── MARKETING: Compra de Material POP (2 niveles) ──────────────────────────
INSERT INTO flow_configs (id, request_type_id, level, label, approver_type, approver_value) VALUES
  ('fc-mkt-p-1', 'mkt-pop',       1, 'Coordinacion de Marketing', 'job_title', 'Coordinador de Marketing'),
  ('fc-mkt-p-2', 'mkt-pop',       2, 'Gerencia Administrativa',   'job_title', 'Gerente Administrativo');

-- ─── MARKETING: Produccion de Contenido (2 niveles) ─────────────────────────
INSERT INTO flow_configs (id, request_type_id, level, label, approver_type, approver_value) VALUES
  ('fc-mkt-c-1', 'mkt-contenido', 1, 'Coordinacion de Marketing', 'job_title', 'Coordinador de Marketing'),
  ('fc-mkt-c-2', 'mkt-contenido', 2, 'Gerencia Comercial',        'job_title', 'Gerente Comercial');

-- ─── BI: Solicitud de Reporte o Analisis (2 niveles) ────────────────────────
INSERT INTO flow_configs (id, request_type_id, level, label, approver_type, approver_value) VALUES
  ('fc-bi-r-1',  'bi-reporte',    1, 'Lider de Business Intelligence', 'job_title', 'Lider de BI'),
  ('fc-bi-r-2',  'bi-reporte',    2, 'Gerencia de TI',                 'job_title', 'Gerente de TI');

-- ─── BI: Nuevo Dashboard o Visualizacion (2 niveles) ────────────────────────
INSERT INTO flow_configs (id, request_type_id, level, label, approver_type, approver_value) VALUES
  ('fc-bi-d-1',  'bi-dashboard',  1, 'Lider de Business Intelligence', 'job_title', 'Lider de BI'),
  ('fc-bi-d-2',  'bi-dashboard',  2, 'Gerencia de TI',                 'job_title', 'Gerente de TI');

-- ─── BI: Extraccion y Procesamiento de Datos (3 niveles) ────────────────────
INSERT INTO flow_configs (id, request_type_id, level, label, approver_type, approver_value) VALUES
  ('fc-bi-x-1',  'bi-datos',      1, 'Lider de Business Intelligence', 'job_title', 'Lider de BI'),
  ('fc-bi-x-2',  'bi-datos',      2, 'Gerencia de TI',                 'job_title', 'Gerente de TI'),
  ('fc-bi-x-3',  'bi-datos',      3, 'Direccion General',              'job_title', 'Director General');

-- ── 4. VERIFICAR ─────────────────────────────────────────────────────────────
SELECT 'Tipos creados' AS check_item, COUNT(*) AS total FROM request_types;
SELECT 'Flujos creados' AS check_item, COUNT(*) AS total FROM flow_configs;
SELECT 'Solicitudes restantes' AS check_item, COUNT(*) AS total FROM requests;
