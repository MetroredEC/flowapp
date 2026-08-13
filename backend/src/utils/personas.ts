// Personas de FlowApp.
//
// La persona no se declara: se deduce del trabajo real que la persona tiene
// delante. El objetivo es que nadie tenga que aprender la aplicación para
// saber dónde empezar. Cada persona se detecta con una señal verificable y
// esa señal se devuelve al frontend para que la elección sea explicable.

export type PersonaKey =
  | 'solicitante' | 'ejecutor' | 'aprobador'
  | 'lider' | 'gerencia' | 'admin';

export interface PersonaDefinition {
  key: PersonaKey;
  label: string;
  /** Qué resuelve esta persona, en una frase. */
  purpose: string;
  /** Ruta de inicio cuando es la persona principal. */
  home: string;
  /**
   * Peso estructural para elegir la persona principal. Se usa el peso del rol
   * y no el conteo de pendientes: la pantalla de inicio no debe cambiar de un
   * día para otro porque hoy llegaron tres aprobaciones más.
   */
  weight: number;
}

export const PERSONAS: Record<PersonaKey, PersonaDefinition> = {
  gerencia: {
    key: 'gerencia', label: 'Gerencia', weight: 50, home: '/gerencia',
    purpose: 'Resultados, riesgos, demanda y desempeño por área',
  },
  lider: {
    key: 'lider', label: 'Líder de área', weight: 40, home: '/equipo',
    purpose: 'Capacidad, SLA, cuellos de botella y distribución',
  },
  aprobador: {
    key: 'aprobador', label: 'Aprobador', weight: 30, home: '/decisiones',
    purpose: 'Decisiones pendientes, contexto, impacto y vencimiento',
  },
  ejecutor: {
    key: 'ejecutor', label: 'Ejecutor', weight: 20, home: '/mi-dia',
    purpose: 'Tu día, prioridades, bloqueos, agenda y carga',
  },
  admin: {
    key: 'admin', label: 'Administrador', weight: 15, home: '/admin',
    purpose: 'Diseñador de procesos, reglas, permisos e integraciones',
  },
  solicitante: {
    key: 'solicitante', label: 'Solicitante', weight: 10, home: '/mis-solicitudes',
    purpose: 'Tus solicitudes, estado, próximos pasos y entregables',
  },
};

export interface PersonaSignals {
  pendingApprovals: number;
  approverInProcesses: number;
  openTasks: number;
  /** Espacios donde la persona ejecuta, lidere o no. */
  memberSpaces: number;
  ledSpaces: number;
  openRequests: number;
  totalRequests: number;
}

export interface DetectedPersona {
  key: PersonaKey;
  label: string;
  purpose: string;
  home: string;
  /** Por qué FlowApp cree que esta persona aplica. */
  reason: string;
}

export interface PersonaProfile {
  email: string;
  name: string;
  personas: DetectedPersona[];
  /** Persona con la que arranca la sesión. */
  primary: PersonaKey;
  /** Persona fijada manualmente, si la hay. */
  preferred: PersonaKey | null;
  home: string;
  signals: PersonaSignals;
}

const EMPTY_SIGNALS: PersonaSignals = {
  pendingApprovals: 0, approverInProcesses: 0, openTasks: 0,
  memberSpaces: 0, ledSpaces: 0, openRequests: 0, totalRequests: 0,
};

export function isPersonaKey(value: unknown): value is PersonaKey {
  return typeof value === 'string' && value in PERSONAS;
}

/**
 * Lee las señales del usuario en una sola pasada.
 * Cada consulta está acotada a índices existentes para que el arranque de la
 * sesión no dependa de recorridos completos de tabla.
 */
export async function readPersonaSignals(
  db: D1Database, userId: string, email: string,
): Promise<PersonaSignals> {
  const lower = (email || '').toLowerCase();
  if (!lower && !userId) return EMPTY_SIGNALS;

  const [approvals, processes, tasks, spaces, requests] = await Promise.all([
    db.prepare(`
      SELECT COUNT(*) AS n
      FROM approval_steps s
      JOIN requests r ON r.id = s.request_id
      WHERE s.status = 'pending' AND r.status = 'in_progress'
        AND r.current_level = s.level
        AND (s.approver_id = ? OR lower(s.approver_email) = ?)
    `).bind(userId, lower).first<{ n: number }>(),

    db.prepare(`
      SELECT COUNT(*) AS n FROM flow_configs
      WHERE is_active = 1 AND lower(COALESCE(approver_email, '')) = ?
    `).bind(lower).first<{ n: number }>(),

    db.prepare(`
      SELECT COUNT(*) AS n
      FROM ws_tasks t
      LEFT JOIN ws_space_statuses ss ON ss.space_id = t.space_id AND ss.key = t.status
      WHERE lower(COALESCE(t.assignee_email, '')) = ?
        AND t.archived = 0 AND COALESCE(ss.is_done, 0) = 0
    `).bind(lower).first<{ n: number }>(),

    db.prepare(`
      SELECT COUNT(*) AS n,
             SUM(CASE WHEN role = 'lead' THEN 1 ELSE 0 END) AS leads
      FROM ws_space_members
      WHERE lower(user_email) = ?
    `).bind(lower).first<{ n: number; leads: number }>(),

    db.prepare(`
      SELECT COUNT(*) AS total,
             SUM(CASE WHEN status IN ('draft','pending','in_progress') THEN 1 ELSE 0 END) AS open
      FROM requests
      WHERE requester_id = ? OR lower(requester_email) = ?
    `).bind(userId, lower).first<{ total: number; open: number }>(),
  ]);

  return {
    pendingApprovals: approvals?.n ?? 0,
    approverInProcesses: processes?.n ?? 0,
    openTasks: tasks?.n ?? 0,
    memberSpaces: spaces?.n ?? 0,
    ledSpaces: spaces?.leads ?? 0,
    openRequests: requests?.open ?? 0,
    totalRequests: requests?.total ?? 0,
  };
}

/** Traduce señales y roles de Entra en el conjunto de personas disponibles. */
export function detectPersonas(signals: PersonaSignals, roles: string[]): DetectedPersona[] {
  const has = (role: string) => roles.includes(role);
  const found: DetectedPersona[] = [];

  const add = (key: PersonaKey, reason: string) => {
    const definition = PERSONAS[key];
    found.push({
      key, label: definition.label, purpose: definition.purpose,
      home: definition.home, reason,
    });
  };

  if (has('flowapp-admin')) {
    add('admin', 'Tienes el rol de administrador de FlowApp');
  }
  if (has('flowapp-manager') || has('flowapp-admin')) {
    add('gerencia', has('flowapp-manager')
      ? 'Tienes el rol de gerencia'
      : 'El rol de administrador incluye la vista de gerencia');
  }
  if (signals.ledSpaces > 0) {
    add('lider', signals.ledSpaces === 1
      ? 'Lideras un espacio de trabajo'
      : `Lideras ${signals.ledSpaces} espacios de trabajo`);
  }
  if (signals.pendingApprovals > 0) {
    add('aprobador', `${signals.pendingApprovals} ${signals.pendingApprovals === 1 ? 'decisión espera' : 'decisiones esperan'} por ti`);
  } else if (signals.approverInProcesses > 0) {
    add('aprobador', `Eres aprobador en ${signals.approverInProcesses} ${signals.approverInProcesses === 1 ? 'proceso' : 'procesos'}`);
  }
  // Se es ejecutor por pertenecer a un equipo, no por tener trabajo pendiente
  // hoy: quien termina todas sus tareas no deja de ejecutar.
  if (signals.openTasks > 0) {
    add('ejecutor', `${signals.openTasks} ${signals.openTasks === 1 ? 'tarea abierta' : 'tareas abiertas'} a tu nombre`);
  } else if (signals.memberSpaces > 0) {
    add('ejecutor', signals.memberSpaces === 1
      ? 'Formas parte de un espacio de trabajo'
      : `Formas parte de ${signals.memberSpaces} espacios de trabajo`);
  }

  // Todos pueden solicitar: es la puerta de entrada del producto.
  add('solicitante', signals.totalRequests > 0
    ? `Has creado ${signals.totalRequests} ${signals.totalRequests === 1 ? 'solicitud' : 'solicitudes'}`
    : 'Cualquier persona puede abrir una solicitud');

  return found.sort((a, b) => PERSONAS[b.key].weight - PERSONAS[a.key].weight);
}

export function buildProfile(
  email: string, name: string, signals: PersonaSignals,
  roles: string[], preferred: PersonaKey | null,
): PersonaProfile {
  const personas = detectPersonas(signals, roles);
  // Una preferencia solo se respeta si la persona sigue estando disponible:
  // quien deja de liderar un área no debe quedar atrapado en su tablero.
  const pinned = preferred && personas.some(p => p.key === preferred) ? preferred : null;
  const primary = pinned ?? personas[0]?.key ?? 'solicitante';
  return {
    email, name, personas, primary,
    preferred: pinned,
    home: PERSONAS[primary].home,
    signals,
  };
}
