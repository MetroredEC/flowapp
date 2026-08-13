-- ============================================================
-- FLOWAPP: Seed de procesos por área
--   BI:        Solicitud de reportes · Mejora de reportes
--   Comercial: Solicitud de ferias · Cambio de tarifarios
--   Marketing: Solicitud de campañas · Solicitud de artes
--   SSO:       Solicitud a Operaciones (embudo de ventas)
-- Idempotente: usa INSERT OR REPLACE con IDs fijos.
-- Ejecutar con:
--   npx wrangler d1 execute flowapp-db --env production --remote --file seed_area_processes.sql
-- ============================================================

-- ─── TIPOS DE SOLICITUD ──────────────────────────────────────
INSERT OR REPLACE INTO request_types (id, name, description, is_active) VALUES
  ('rt-bi-reportes',   'BI — Solicitud de reportes',        'Nuevos dashboards, reportes puntuales, automatizaciones y extracciones de datos', 1),
  ('rt-bi-mejoras',    'BI — Mejora de reportes',           'Mejoras y ajustes a reportes o dashboards existentes', 1),
  ('rt-com-ferias',    'Comercial — Solicitud de ferias',   'Participación en ferias, stands y eventos comerciales', 1),
  ('rt-com-tarifas',   'Comercial — Cambio de tarifarios',  'Modificación de tarifas para convenios y empresas', 1),
  ('rt-mkt-campanas',  'Marketing — Solicitud de campañas', 'Campañas de comunicación y publicidad', 1),
  ('rt-mkt-artes',     'Marketing — Solicitud de artes',    'Diseño de artes y material gráfico para el área de marketing', 1),
  ('rt-sso-operaciones','SSO — Solicitud a Operaciones',    'Envío de venta cerrada a Operaciones: contrato, cotización, contacto y montos', 1);

-- ─── FLUJOS DE APROBACIÓN (por cargo, editables en Admin → Flujos) ───────────
DELETE FROM flow_configs WHERE request_type_id IN
  ('rt-bi-reportes','rt-bi-mejoras','rt-com-ferias','rt-com-tarifas','rt-mkt-campanas','rt-mkt-artes','rt-sso-operaciones');

INSERT INTO flow_configs (id, request_type_id, level, label, approver_type, approver_value, approver_name, approver_email) VALUES
  -- BI: 1 nivel
  ('fl-bi-rep-1',  'rt-bi-reportes',    1, 'Jefatura BI',              'job_title', 'Jefe de Business Intelligence', NULL, NULL),
  ('fl-bi-mej-1',  'rt-bi-mejoras',     1, 'Jefatura BI',              'job_title', 'Jefe de Business Intelligence', NULL, NULL),
  -- Comercial ferias: 2 niveles
  ('fl-com-fer-1', 'rt-com-ferias',     1, 'Gerencia Comercial',       'job_title', 'Gerente Comercial', NULL, NULL),
  ('fl-com-fer-2', 'rt-com-ferias',     2, 'Coordinación de Marketing','job_title', 'Coordinador de Marketing', NULL, NULL),
  -- Comercial tarifarios: 2 niveles
  ('fl-com-tar-1', 'rt-com-tarifas',    1, 'Gerencia Comercial',       'job_title', 'Gerente Comercial', NULL, NULL),
  ('fl-com-tar-2', 'rt-com-tarifas',    2, 'Finanzas',                 'job_title', 'Gerente Financiero', NULL, NULL),
  -- Marketing campañas: 2 niveles
  ('fl-mkt-cam-1', 'rt-mkt-campanas',   1, 'Coordinación de Marketing','job_title', 'Coordinador de Marketing', NULL, NULL),
  ('fl-mkt-cam-2', 'rt-mkt-campanas',   2, 'Gerencia Comercial',       'job_title', 'Gerente Comercial', NULL, NULL),
  -- Marketing artes: 1 nivel
  ('fl-mkt-art-1', 'rt-mkt-artes',      1, 'Coordinación de Marketing','job_title', 'Coordinador de Marketing', NULL, NULL),
  -- SSO → Operaciones: 2 niveles
  ('fl-sso-ope-1', 'rt-sso-operaciones',1, 'Gerencia SSO',             'job_title', 'Gerente SSO', NULL, NULL),
  ('fl-sso-ope-2', 'rt-sso-operaciones',2, 'Operaciones',              'job_title', 'Gerente de Operaciones', NULL, NULL);

-- ─── FORMULARIOS (request_type_fields, renderizados en Nueva Solicitud) ──────
DELETE FROM request_type_fields WHERE request_type_id IN
  ('rt-bi-reportes','rt-bi-mejoras','rt-com-ferias','rt-com-tarifas','rt-mkt-campanas','rt-mkt-artes','rt-sso-operaciones');

-- BI — Solicitud de reportes
INSERT INTO request_type_fields (id, request_type_id, field_key, label, field_type, placeholder, required, options_json, sort_order) VALUES
  ('f-bir-1','rt-bi-reportes','area_solicitante','¿A qué equipo perteneces?','select','Selecciona tu área...',1,'["Analítica y tecnología","Proyectos y procesos","Customer experience y contact center","Supply chain y negocios complementarios","Comercial","Operaciones","Marketing","Finanzas"]',0),
  ('f-bir-2','rt-bi-reportes','tipo_reporte','Tipo de solicitud','select',NULL,1,'["Nuevo dashboard","Reporte puntual","Automatización","Extracción de datos","Indicador / KPI nuevo"]',1),
  ('f-bir-3','rt-bi-reportes','fuente_datos','Fuente de datos (sistema, base, archivo)','text','Ej: HIS, CRM, Excel de ventas...',0,NULL,2),
  ('f-bir-4','rt-bi-reportes','frecuencia','Frecuencia de actualización','select',NULL,1,'["Única vez","Diaria","Semanal","Mensual","Trimestral"]',3),
  ('f-bir-5','rt-bi-reportes','prioridad','Prioridad','select',NULL,1,'["Alta (3-4 días laborales)","Media (5-6 días laborales)","Baja (7+ días laborales)"]',4),
  ('f-bir-6','rt-bi-reportes','fecha_requerida','Fecha en que lo necesitas','date',NULL,1,NULL,5);

-- BI — Mejora de reportes
INSERT INTO request_type_fields (id, request_type_id, field_key, label, field_type, placeholder, required, options_json, sort_order) VALUES
  ('f-bim-1','rt-bi-mejoras','reporte_actual','¿Qué reporte o dashboard quieres mejorar?','text','Nombre del reporte en Power BI...',1,NULL,0),
  ('f-bim-2','rt-bi-mejoras','tipo_mejora','Tipo de mejora','select',NULL,1,'["Nuevo indicador o gráfico","Corrección de datos","Cambio de diseño / layout","Nuevo filtro o segmentación","Rendimiento / velocidad","Otro"]',1),
  ('f-bim-3','rt-bi-mejoras','impacto','¿Qué impacto esperas de esta mejora?','textarea','Describe qué decisión o proceso mejora...',1,NULL,2),
  ('f-bim-4','rt-bi-mejoras','prioridad','Prioridad','select',NULL,1,'["Alta (3-4 días laborales)","Media (5-6 días laborales)","Baja (7+ días laborales)"]',3);

-- Comercial — Solicitud de ferias
INSERT INTO request_type_fields (id, request_type_id, field_key, label, field_type, placeholder, required, options_json, sort_order) VALUES
  ('f-cf-1','rt-com-ferias','nombre_feria','Nombre de la feria o evento','text','Ej: Feria de salud empresarial Quito',1,NULL,0),
  ('f-cf-2','rt-com-ferias','ciudad','Ciudad / ubicación','text',NULL,1,NULL,1),
  ('f-cf-3','rt-com-ferias','fecha_inicio','Fecha de inicio','date',NULL,1,NULL,2),
  ('f-cf-4','rt-com-ferias','fecha_fin','Fecha de fin','date',NULL,1,NULL,3),
  ('f-cf-5','rt-com-ferias','presupuesto','Presupuesto estimado (USD)','number','0.00',1,NULL,4),
  ('f-cf-6','rt-com-ferias','material','Material y recursos requeridos','textarea','Stand, roll-ups, material POP, personal...',1,NULL,5),
  ('f-cf-7','rt-com-ferias','publico_esperado','Público esperado (asistentes)','number',NULL,0,NULL,6);

-- Comercial — Cambio de tarifarios
INSERT INTO request_type_fields (id, request_type_id, field_key, label, field_type, placeholder, required, options_json, sort_order) VALUES
  ('f-ct-1','rt-com-tarifas','empresa','Empresa / convenio','text','Nombre de la empresa o aseguradora',1,NULL,0),
  ('f-ct-2','rt-com-tarifas','tipo_cambio','Tipo de cambio','select',NULL,1,'["Nuevo tarifario","Actualización de precios","Descuento especial","Inclusión de servicios","Exclusión de servicios"]',1),
  ('f-ct-3','rt-com-tarifas','detalle_cambio','Detalle del cambio solicitado','textarea','Servicios afectados, precios actuales y propuestos...',1,NULL,2),
  ('f-ct-4','rt-com-tarifas','fecha_vigencia','Fecha de vigencia solicitada','date',NULL,1,NULL,3),
  ('f-ct-5','rt-com-tarifas','impacto_estimado','Impacto estimado en facturación (USD/mes)','number',NULL,0,NULL,4);

-- Marketing — Solicitud de campañas
INSERT INTO request_type_fields (id, request_type_id, field_key, label, field_type, placeholder, required, options_json, sort_order) VALUES
  ('f-mc-1','rt-mkt-campanas','objetivo','Objetivo de la campaña','select',NULL,1,'["Captación de pacientes","Posicionamiento de marca","Lanzamiento de servicio","Fidelización","Comunicación interna","Convenio / empresa"]',0),
  ('f-mc-2','rt-mkt-campanas','audiencia','¿A quién está dirigida?','select',NULL,1,'["Pacientes","Médicos","Colaboradores Metrored","Empresas","Proveedores","Comunidad","Aseguradoras"]',1),
  ('f-mc-3','rt-mkt-campanas','canal_principal','Canal principal','select',NULL,1,'["Mailing","WhatsApp","Redes sociales","Sitio web","Pantallas centros médicos","POP","Medios pagados","Varios canales"]',2),
  ('f-mc-4','rt-mkt-campanas','fecha_lanzamiento','Fecha de lanzamiento deseada','date',NULL,1,NULL,3),
  ('f-mc-5','rt-mkt-campanas','fecha_fin','Fecha de fin de campaña','date',NULL,0,NULL,4),
  ('f-mc-6','rt-mkt-campanas','presupuesto','Presupuesto estimado (USD)','number','0.00',0,NULL,5),
  ('f-mc-7','rt-mkt-campanas','mensaje_clave','Mensaje clave de la campaña','textarea','¿Qué debe comunicar la campaña?',1,NULL,6);

-- Marketing — Solicitud de artes (basado en el formulario real de Metrored)
INSERT INTO request_type_fields (id, request_type_id, field_key, label, field_type, placeholder, required, options_json, sort_order) VALUES
  ('f-ma-1','rt-mkt-artes','correo_metrored','¿Cuál es tu correo de Metrored?','text','nombre@metrored.med.ec',1,NULL,0),
  ('f-ma-2','rt-mkt-artes','equipo','¿A qué equipo perteneces?','select',NULL,1,'["Analítica y tecnología","Proyectos y procesos","Customer experience y contact center","Supply chain y negocios complementarios","Comercial","Operaciones"]',1),
  ('f-ma-3','rt-mkt-artes','prioridad','¿Qué nivel de prioridad atribuyes a tu solicitud?','select',NULL,1,'["Alta (entrega en 3-4 días laborales)","Media (entrega en 5-6 días laborales)","Baja (entrega en 7+ días laborales)"]',2),
  ('f-ma-4','rt-mkt-artes','tipo_material','¿Qué tipo de material solicitas? (principal)','select',NULL,1,'["Mailing","WhatsApp","Facebook","Instagram","LinkedIn","Afiche - señalética","TikTok","Sitio web Metrored","Pantallas centros médicos","POP","Comunicación interna","Revista / catálogo físico","Flyer digital","Diapositiva (PowerPoint)","Flyer impreso","Video"]',3),
  ('f-ma-5','rt-mkt-artes','canales_adicionales','Otros canales donde se publicará (si aplica)','text','Ej: Instagram, Mailing, POP...',0,NULL,4),
  ('f-ma-6','rt-mkt-artes','dirigido_a','¿A quién está dirigido el material?','select',NULL,1,'["Pacientes","Médicos","Colaboradores Metrored","Empresas","Proveedores","Comunidad","Aseguradora"]',5),
  ('f-ma-7','rt-mkt-artes','contenido_arte','Describe el diseño y escribe el texto/contenido que debe aparecer en el arte','textarea','Texto exacto, colores, referencias...',1,NULL,6),
  ('f-ma-8','rt-mkt-artes','observaciones','¿Tienes alguna observación adicional?','textarea',NULL,0,NULL,7);

-- SSO — Solicitud a Operaciones (embudo de ventas)
INSERT INTO request_type_fields (id, request_type_id, field_key, label, field_type, placeholder, required, options_json, sort_order) VALUES
  ('f-so-1','rt-sso-operaciones','empresa','Nombre de la empresa / cliente','text',NULL,1,NULL,0),
  ('f-so-2','rt-sso-operaciones','contacto_nombre','Contacto de la empresa (nombre)','text',NULL,1,NULL,1),
  ('f-so-3','rt-sso-operaciones','contacto_correo','Correo del contacto','text','contacto@empresa.com',1,NULL,2),
  ('f-so-4','rt-sso-operaciones','contacto_telefono','Teléfono del contacto','text',NULL,1,NULL,3),
  ('f-so-5','rt-sso-operaciones','monto_venta','Monto de venta (USD)','number','0.00',1,NULL,4),
  ('f-so-6','rt-sso-operaciones','numero_contrato','Número de contrato','text','Adjunta el contrato en Archivos de respaldo',1,NULL,5),
  ('f-so-7','rt-sso-operaciones','numero_cotizacion','Número de cotización','text','Adjunta la cotización en Archivos de respaldo',1,NULL,6),
  ('f-so-8','rt-sso-operaciones','servicio_contratado','Servicio contratado','select',NULL,1,'["Medicina prepagada","Chequeos ejecutivos","Salud ocupacional","Convenio empresarial","Otro"]',7),
  ('f-so-9','rt-sso-operaciones','fecha_inicio','Fecha estimada de inicio del servicio','date',NULL,1,NULL,8),
  ('f-so-10','rt-sso-operaciones','observaciones','Observaciones para Operaciones','textarea',NULL,0,NULL,9);

-- ─── CONFIG DE PROCESO (color y categoría para el wizard) ────────────────────
INSERT OR REPLACE INTO process_configs (id, form_schema_json, close_schema_json, email_subject, email_body, color, icon, category) VALUES
  ('rt-bi-reportes',   '[]','[]','Tu solicitud de reporte "{{titulo}}" fue aprobada','Hola {{solicitante}},\n\nTu solicitud de reporte BI ha sido aprobada y está en cola de desarrollo.\n\n• Título: {{titulo}}\n• Fecha: {{fecha}}\n\nConsulta el estado: {{url_solicitud}}\n\nEquipo BI','#0284C7','chart','bi'),
  ('rt-bi-mejoras',    '[]','[]','Tu mejora "{{titulo}}" fue aprobada','Hola {{solicitante}},\n\nTu solicitud de mejora ha sido aprobada.\n\n• Título: {{titulo}}\n• Fecha: {{fecha}}\n\nConsulta el estado: {{url_solicitud}}\n\nEquipo BI','#0891B2','chart','bi'),
  ('rt-com-ferias',    '[]','[]','Feria "{{titulo}}" aprobada','Hola {{solicitante}},\n\nLa participación en la feria fue aprobada.\n\n• Evento: {{titulo}}\n• Fecha de aprobación: {{fecha}}\n• Aprobado por: {{aprobadores}}\n\nDetalle: {{url_solicitud}}\n\nGerencia Comercial','#059669','shop','comercial'),
  ('rt-com-tarifas',   '[]','[]','Cambio de tarifario "{{titulo}}" aprobado','Hola {{solicitante}},\n\nEl cambio de tarifario fue aprobado y entrará en vigencia según lo solicitado.\n\n• Solicitud: {{titulo}}\n• Aprobado por: {{aprobadores}}\n\nDetalle: {{url_solicitud}}\n\nGerencia Comercial','#D97706','doc','comercial'),
  ('rt-mkt-campanas',  '[]','[]','Campaña "{{titulo}}" aprobada','Hola {{solicitante}},\n\nTu campaña fue aprobada. El equipo de Marketing coordinará la ejecución.\n\n• Campaña: {{titulo}}\n• Fecha: {{fecha}}\n\nDetalle: {{url_solicitud}}\n\nEquipo Marketing','#DB2777','brush','marketing'),
  ('rt-mkt-artes',     '[]','[]','Tu arte "{{titulo}}" fue aprobado','Hola {{solicitante}},\n\nTu solicitud de arte fue aprobada y asignada al equipo de diseño.\n\n• Solicitud: {{titulo}}\n• Fecha: {{fecha}}\n\nRecibirás el material según la prioridad indicada.\n\nDetalle: {{url_solicitud}}\n\nEquipo Marketing','#7C3AED','brush','marketing'),
  ('rt-sso-operaciones','[]','[]','Venta "{{titulo}}" enviada a Operaciones','Hola {{solicitante}},\n\nLa solicitud fue aprobada y entregada a Operaciones para la implementación del servicio.\n\n• Cliente: {{titulo}}\n• Aprobado por: {{aprobadores}}\n• Fecha: {{fecha}}\n\nSeguimiento: {{url_solicitud}}\n\nEquipo SSO','#4F46E5','users','operaciones');

SELECT 'Seed de procesos por área completado: ' || COUNT(*) || ' tipos activos' AS result
FROM request_types
WHERE id IN ('rt-bi-reportes','rt-bi-mejoras','rt-com-ferias','rt-com-tarifas','rt-mkt-campanas','rt-mkt-artes','rt-sso-operaciones');
