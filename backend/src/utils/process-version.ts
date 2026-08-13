// Resolución de la versión del proceso con la que vive cada solicitud.
//
// Una solicitud se ejecuta con las reglas que existían cuando nació. Editar un
// proceso publica una versión nueva y solo afecta a lo que empiece después:
// cambiarle el checklist o los entregables a un trabajo en curso deja al equipo
// cumpliendo requisitos que nadie pidió cuando se aprobó.
//
// Las solicitudes anteriores al versionado no tienen snapshot, y los snapshots
// creados por la migración inicial solo guardaron la parte de formulario. Por
// eso la resolución mezcla: vale el snapshot cuando trae el dato, y la
// configuración vigente cuando no.

export interface ExecutionConfig {
  workspace_id: string | null;
  assignment_mode: 'auto_load' | 'manual' | 'fixed_user' | null;
  fixed_assignee_id: string | null;
  fixed_assignee_name: string | null;
  fixed_assignee_email: string | null;
  execution_sla_days: number | null;
  checklist_json: string | null;
  deliverables_json: string | null;
  require_requester_confirmation: number | null;
  email_subject: string | null;
  email_body: string | null;
}

interface SnapshotShape {
  workspace_id?: string | null;
  assignment_mode?: string | null;
  fixed_assignee_id?: string | null;
  fixed_assignee_name?: string | null;
  fixed_assignee_email?: string | null;
  execution_sla_days?: number | null;
  checklist?: unknown;
  deliverables?: unknown;
  require_requester_confirmation?: number | null;
  email_subject?: string | null;
  email_body?: string | null;
}

const ASSIGNMENT_MODES = ['auto_load', 'manual', 'fixed_user'] as const;

function parseSnapshot(raw: unknown): SnapshotShape | null {
  if (!raw) return null;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return parsed && typeof parsed === 'object' ? parsed as SnapshotShape : null;
  } catch { return null; }
}

/** El snapshot guarda arreglos; process_configs guarda cadenas JSON. */
function asJsonList(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  return Array.isArray(value) ? JSON.stringify(value) : null;
}

function pick<T>(fromSnapshot: T | null | undefined, fromLive: T | null | undefined): T | null {
  return fromSnapshot !== undefined && fromSnapshot !== null ? fromSnapshot : (fromLive ?? null);
}

/**
 * Configuración de ejecución vigente para una solicitud concreta.
 * `requestId` manda: se usa la versión anclada en la solicitud, no la última.
 */
export async function resolveExecutionConfig(
  db: D1Database, requestId: string,
): Promise<ExecutionConfig | null> {
  const row = await db.prepare(`
    SELECT r.request_type_id, pv.snapshot_json,
           pc.workspace_id, pc.assignment_mode,
           pc.fixed_assignee_id, pc.fixed_assignee_name, pc.fixed_assignee_email,
           pc.execution_sla_days, pc.checklist_json, pc.deliverables_json,
           pc.require_requester_confirmation, pc.email_subject, pc.email_body
    FROM requests r
    LEFT JOIN process_versions pv ON pv.id = r.process_version_id
    LEFT JOIN process_configs  pc ON pc.id = r.request_type_id
    WHERE r.id = ?
  `).bind(requestId).first<Record<string, unknown>>();
  if (!row) return null;

  const snapshot = parseSnapshot(row.snapshot_json);
  const mode = pick(snapshot?.assignment_mode, row.assignment_mode as string | null);

  return {
    workspace_id: pick(snapshot?.workspace_id, row.workspace_id as string | null),
    assignment_mode: ASSIGNMENT_MODES.includes(mode as typeof ASSIGNMENT_MODES[number])
      ? mode as ExecutionConfig['assignment_mode']
      : null,
    fixed_assignee_id: pick(snapshot?.fixed_assignee_id, row.fixed_assignee_id as string | null),
    fixed_assignee_name: pick(snapshot?.fixed_assignee_name, row.fixed_assignee_name as string | null),
    fixed_assignee_email: pick(snapshot?.fixed_assignee_email, row.fixed_assignee_email as string | null),
    execution_sla_days: pick(snapshot?.execution_sla_days, row.execution_sla_days as number | null),
    checklist_json: pick(asJsonList(snapshot?.checklist), row.checklist_json as string | null),
    deliverables_json: pick(asJsonList(snapshot?.deliverables), row.deliverables_json as string | null),
    require_requester_confirmation: pick(
      snapshot?.require_requester_confirmation,
      row.require_requester_confirmation as number | null,
    ),
    email_subject: pick(snapshot?.email_subject, row.email_subject as string | null),
    email_body: pick(snapshot?.email_body, row.email_body as string | null),
  };
}
