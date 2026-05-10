import { Hono } from 'hono';
import { AppEnv } from '../types';

const router = new Hono<AppEnv>();

type ProposalNode = {
  id: string;
  type: 'start' | 'task' | 'approval' | 'end';
  label: string;
  description?: string;
  approver_type?: 'email' | 'requester' | 'role';
  approver_email?: string;
  role?: string;
  form?: {
    fields: Array<{
      key: string;
      label: string;
      type: 'text' | 'number' | 'date' | 'textarea' | 'select' | 'checkbox';
      required?: boolean;
      placeholder?: string;
      options?: string[];
    }>;
  };
  attachment_rules?: {
    required?: boolean;
    min_files?: number;
    allowed_types?: string[];
    label?: string;
  };
};

type Proposal = {
  process_key: string;
  process_name: string;
  version: number;
  nodes: ProposalNode[];
};

router.get('/blueprints', async (c) => {
  const rows = await c.env.DB.prepare(`
    SELECT *
      FROM process_blueprints
     ORDER BY created_at DESC
  `).all();

  return c.json({
    data: rows.results || [],
  });
});

router.post('/blueprints', async (c) => {
  const body = await c.req.json();

  const id = crypto.randomUUID();

  await c.env.DB.prepare(`
    INSERT INTO process_blueprints (
      id,
      name,
      description,
      source_text,
      status,
      created_by_email,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, 'draft', ?, datetime('now'), datetime('now'))
  `).bind(
    id,
    body.name || 'Nuevo proceso',
    body.description || '',
    body.source_text || '',
    c.get('userEmail') || ''
  ).run();

  return c.json({
    data: { id },
  });
});

router.put('/blueprints/:id/proposal', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();

  await c.env.DB.prepare(`
    UPDATE process_blueprints
       SET proposed_process_json = ?,
           status = CASE WHEN status = 'deployed' THEN status ELSE 'analyzed' END,
           updated_at = datetime('now')
     WHERE id = ?
  `).bind(
    JSON.stringify(body.proposal || {}),
    id
  ).run();

  return c.json({
    data: {
      saved: true,
    },
  });
});

router.post('/blueprints/:id/analyze', async (c) => {
  const id = c.req.param('id');

  const blueprint = await c.env.DB.prepare(`
    SELECT id, name, description, source_text
      FROM process_blueprints
     WHERE id = ?
  `).bind(id).first<{
    id: string;
    name: string;
    description?: string | null;
    source_text?: string | null;
  }>();

  if (!blueprint) {
    return c.json({ error: 'not_found' }, 404);
  }

  const source = String(blueprint.source_text || '').toLowerCase();

  const nodes: ProposalNode[] = [];

  nodes.push({
    id: 'solicitud',
    type: 'task',
    label: 'Solicitud inicial',
    description: 'El usuario registra la solicitud.',
    approver_type: 'requester',
    form: {
      fields: [
        {
          key: 'descripcion',
          label: 'Descripcion del requerimiento',
          type: 'textarea',
          required: true,
          placeholder: 'Explica claramente lo que necesitas',
        },
      ],
    },
    attachment_rules: {
      required: false,
      min_files: 0,
      allowed_types: ['pdf', 'jpg', 'png', 'xlsx'],
      label: 'Adjuntos opcionales',
    },
  });

  if (source.includes('compr') || source.includes('cotiz')) {
    nodes.push({
      id: 'compras',
      type: 'approval',
      label: 'Compras cotiza y revisa',
      description: 'Compras valida proveedores, cotizaciones y disponibilidad.',
      approver_type: 'email',
      approver_email: 'compras@metrored.med.ec',
      form: {
        fields: [
          {
            key: 'proveedor',
            label: 'Proveedor seleccionado',
            type: 'text',
            required: true,
          },
          {
            key: 'monto_cotizado',
            label: 'Monto cotizado',
            type: 'number',
            required: true,
          },
          {
            key: 'observacion_compras',
            label: 'Observacion de compras',
            type: 'textarea',
            required: false,
          },
        ],
      },
      attachment_rules: {
        required: true,
        min_files: 1,
        allowed_types: ['pdf', 'jpg', 'png'],
        label: 'Cotizacion obligatoria',
      },
    });
  }

  if (source.includes('contab') || source.includes('presupuesto') || source.includes('presupue')) {
    nodes.push({
      id: 'contabilidad',
      type: 'approval',
      label: 'Contabilidad valida presupuesto',
      description: 'Contabilidad confirma disponibilidad presupuestaria.',
      approver_type: 'email',
      approver_email: 'contabilidad@metrored.med.ec',
      form: {
        fields: [
          {
            key: 'centro_costo',
            label: 'Centro de costo',
            type: 'text',
            required: true,
          },
          {
            key: 'presupuesto_aprobado',
            label: 'Presupuesto aprobado',
            type: 'checkbox',
            required: true,
          },
          {
            key: 'comentario_contabilidad',
            label: 'Comentario contable',
            type: 'textarea',
            required: false,
          },
        ],
      },
      attachment_rules: {
        required: false,
        min_files: 0,
        allowed_types: ['pdf', 'xlsx'],
        label: 'Soporte presupuestario',
      },
    });
  }

  if (source.includes('despach')) {
    nodes.push({
      id: 'despacho',
      type: 'task',
      label: 'Compras despacha',
      description: 'Compras registra despacho, cantidades y fecha estimada.',
      approver_type: 'email',
      approver_email: 'compras@metrored.med.ec',
      form: {
        fields: [
          {
            key: 'fecha_despacho',
            label: 'Fecha de despacho',
            type: 'date',
            required: true,
          },
          {
            key: 'guia_remision',
            label: 'Guia o referencia de despacho',
            type: 'text',
            required: false,
          },
          {
            key: 'observacion_despacho',
            label: 'Observacion de despacho',
            type: 'textarea',
            required: false,
          },
        ],
      },
      attachment_rules: {
        required: true,
        min_files: 1,
        allowed_types: ['pdf', 'jpg', 'png'],
        label: 'Evidencia de despacho',
      },
    });
  }

  if (source.includes('recep') || source.includes('recib')) {
    nodes.push({
      id: 'recepcion',
      type: 'task',
      label: 'Solicitante recibe y valida',
      description: 'El solicitante confirma cantidades reales y evidencia.',
      approver_type: 'requester',
      form: {
        fields: [
          {
            key: 'cantidad_recibida',
            label: 'Cantidad recibida real',
            type: 'number',
            required: true,
          },
          {
            key: 'conforme',
            label: 'Recepcion conforme',
            type: 'checkbox',
            required: true,
          },
          {
            key: 'observacion_recepcion',
            label: 'Observacion de recepcion',
            type: 'textarea',
            required: false,
          },
        ],
      },
      attachment_rules: {
        required: true,
        min_files: 1,
        allowed_types: ['jpg', 'png', 'pdf'],
        label: 'Foto o evidencia obligatoria',
      },
    });
  }

  if (!nodes.some(n => n.id === 'compras')) {
    nodes.push({
      id: 'revision',
      type: 'approval',
      label: 'Revision principal',
      description: 'Responsable revisa y aprueba la solicitud.',
      approver_type: 'email',
      approver_email: 'proyectos@metrored.med.ec',
      form: {
        fields: [
          {
            key: 'comentario',
            label: 'Comentario',
            type: 'textarea',
            required: false,
          },
        ],
      },
      attachment_rules: {
        required: false,
        min_files: 0,
        allowed_types: ['pdf', 'jpg', 'png', 'xlsx'],
        label: 'Adjuntos',
      },
    });
  }

  const proposal: Proposal = {
    process_key: slugify(blueprint.name),
    process_name: blueprint.name,
    version: 1,
    nodes,
  };

  await c.env.DB.prepare(`
    UPDATE process_blueprints
       SET ai_analysis_json = ?,
           proposed_process_json = ?,
           status = 'analyzed',
           updated_at = datetime('now')
     WHERE id = ?
  `).bind(
    JSON.stringify({
      analyzed: true,
      nodes_detected: nodes.length,
      message: 'Se propuso un flujo editable con pasos, aprobadores, formularios y adjuntos.',
    }),
    JSON.stringify(proposal),
    id
  ).run();

  return c.json({
    data: proposal,
  });
});

router.post('/blueprints/:id/deploy', async (c) => {
  const id = c.req.param('id');

  const blueprint = await c.env.DB.prepare(`
    SELECT id, name, proposed_process_json
      FROM process_blueprints
     WHERE id = ?
  `).bind(id).first<{
    id: string;
    name: string;
    proposed_process_json?: string | null;
  }>();

  if (!blueprint) {
    return c.json({ error: 'not_found' }, 404);
  }

  const proposal = JSON.parse(blueprint.proposed_process_json || '{}') as Proposal;

  if (!proposal.nodes?.length) {
    return c.json({
      error: 'invalid_process',
      message: 'No existe una propuesta valida para desplegar.',
    }, 400);
  }

  const processDefinitionId = crypto.randomUUID();
  const processKey = proposal.process_key || slugify(blueprint.name);

  await c.env.DB.prepare(`
    INSERT INTO process_definitions (
      id,
      key,
      name,
      description,
      version,
      status,
      created_by
    )
    VALUES (?, ?, ?, ?, ?, 'active', ?)
  `).bind(
    processDefinitionId,
    processKey,
    proposal.process_name || blueprint.name,
    'Proceso creado desde constructor no-code',
    proposal.version || 1,
    c.get('userEmail') || ''
  ).run();

  const startNodeId = crypto.randomUUID();

  await c.env.DB.prepare(`
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
    VALUES (?, ?, 'start', 'start', 'Inicio', NULL, 0, 0)
  `).bind(
    startNodeId,
    processDefinitionId
  ).run();

  let previousNodeId = startNodeId;
  let x = 240;

  for (const node of proposal.nodes) {
    const nodeId = crypto.randomUUID();

    const assign = node.approver_type === 'requester'
      ? { type: 'requester' }
      : { type: 'email', value: node.approver_email || 'proyectos@metrored.med.ec' };

    await c.env.DB.prepare(`
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
      VALUES (?, ?, ?, 'task', ?, ?, ?, 0)
    `).bind(
      nodeId,
      processDefinitionId,
      node.id,
      node.label,
      JSON.stringify({
        ...node,
        assign,
      }),
      x
    ).run();

    await c.env.DB.prepare(`
      INSERT INTO workflow_edges (
        id,
        process_definition_id,
        source_node_id,
        target_node_id,
        label
      )
      VALUES (?, ?, ?, ?, 'Continuar')
    `).bind(
      crypto.randomUUID(),
      processDefinitionId,
      previousNodeId,
      nodeId
    ).run();

    previousNodeId = nodeId;
    x += 240;
  }

  const endNodeId = crypto.randomUUID();

  await c.env.DB.prepare(`
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
    VALUES (?, ?, 'end', 'end', 'Fin', NULL, ?, 0)
  `).bind(
    endNodeId,
    processDefinitionId,
    x
  ).run();

  await c.env.DB.prepare(`
    INSERT INTO workflow_edges (
      id,
      process_definition_id,
      source_node_id,
      target_node_id,
      label
    )
    VALUES (?, ?, ?, ?, 'Finalizar')
  `).bind(
    crypto.randomUUID(),
    processDefinitionId,
    previousNodeId,
    endNodeId
  ).run();

  await c.env.DB.prepare(`
    UPDATE process_blueprints
       SET status = 'deployed',
           updated_at = datetime('now')
     WHERE id = ?
  `).bind(id).run();

  return c.json({
    data: {
      deployed: true,
      process_definition_id: processDefinitionId,
      process_key: processKey,
    },
  });
});

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60) || 'proceso';
}

export default router;
