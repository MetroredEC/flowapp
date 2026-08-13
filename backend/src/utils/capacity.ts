// Capacidad real del equipo y asignación automática.
//
// La versión anterior elegía "quien tenga menos tickets abiertos" leyendo
// dept_team_members, una tabla vacía cuya columna department solo admitía
// 'marketing' y 'bi': en la práctica no asignaba a nadie nunca y la tarea nacía
// sin responsable. La fuente correcta es ws_space_members.
//
// Contar tareas tampoco alcanza: cinco revisiones de media hora no son lo mismo
// que dos proyectos de dos días. Aquí la carga se mide en horas comprometidas
// contra las horas disponibles de cada persona, y se descarta a quien no puede
// recibir trabajo.

type DB = D1Database;

/** Minutos asumidos cuando una tarea no trae estimación propia. */
const COMPLEXITY_MINUTES: Record<string, number> = {
  low: 60, normal: 180, high: 480,
};

export interface MemberCapacity {
  user_email: string;
  user_name: string;
  role: 'lead' | 'member';
  weekly_hours: number;
  specialties: string[];
  accepts_auto_assign: number;
  open_tasks: number;
  committed_minutes: number;
  /** Porcentaje de la capacidad semanal ya comprometido. */
  load_pct: number;
  absent: boolean;
  absence_until: string | null;
}

/** Minutos que cuesta una tarea: su estimación, o lo que sugiere su complejidad. */
export function taskMinutes(estimate: unknown, complexity: unknown): number {
  const explicit = Number(estimate);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  return COMPLEXITY_MINUTES[String(complexity ?? 'normal')] ?? COMPLEXITY_MINUTES.normal;
}

/**
 * Carga de cada miembro de un espacio.
 *
 * Las tareas bloqueadas cuentan como carga: la persona sigue siendo
 * responsable de destrabarlas, y descontarlas haría que quien está atascado
 * parezca disponible y reciba todavía más trabajo.
 */
export async function spaceCapacity(db: DB, spaceId: string): Promise<MemberCapacity[]> {
  const [members, tasks, absences] = await Promise.all([
    db.prepare(`
      SELECT user_email, COALESCE(user_name, user_email) AS user_name, role,
             weekly_hours, specialties_json, accepts_auto_assign
      FROM ws_space_members WHERE space_id = ?
    `).bind(spaceId).all(),

    db.prepare(`
      SELECT lower(t.assignee_email) AS email, t.estimate_minutes, t.complexity
      FROM ws_tasks t
      LEFT JOIN ws_space_statuses ss ON ss.space_id = t.space_id AND ss.key = t.status
      WHERE t.space_id = ? AND t.archived = 0 AND COALESCE(ss.is_done, 0) = 0
        AND COALESCE(t.assignee_email, '') <> ''
    `).bind(spaceId).all(),

    db.prepare(`
      SELECT lower(user_email) AS email, MAX(ends_on) AS until
      FROM member_absences
      WHERE date('now','-5 hours') BETWEEN starts_on AND ends_on
      GROUP BY lower(user_email)
    `).all(),
  ]);

  const load = new Map<string, { count: number; minutes: number }>();
  for (const row of tasks.results as Record<string, unknown>[]) {
    const email = String(row.email ?? '');
    const current = load.get(email) ?? { count: 0, minutes: 0 };
    current.count += 1;
    current.minutes += taskMinutes(row.estimate_minutes, row.complexity);
    load.set(email, current);
  }

  const absent = new Map<string, string>();
  for (const row of absences.results as Record<string, unknown>[]) {
    absent.set(String(row.email), String(row.until));
  }

  return (members.results as Record<string, unknown>[]).map(row => {
    const email = String(row.user_email).toLowerCase();
    const stats = load.get(email) ?? { count: 0, minutes: 0 };
    const weeklyHours = Number(row.weekly_hours ?? 30);
    const capacityMinutes = Math.max(1, weeklyHours * 60);

    let specialties: string[] = [];
    try { specialties = JSON.parse(String(row.specialties_json ?? '[]')) as string[]; }
    catch { specialties = []; }

    return {
      user_email: email,
      user_name: String(row.user_name),
      role: (row.role === 'lead' ? 'lead' : 'member') as MemberCapacity['role'],
      weekly_hours: weeklyHours,
      specialties,
      accepts_auto_assign: Number(row.accepts_auto_assign ?? 1),
      open_tasks: stats.count,
      committed_minutes: stats.minutes,
      load_pct: Math.round((stats.minutes / capacityMinutes) * 100),
      absent: absent.has(email),
      absence_until: absent.get(email) ?? null,
    };
  }).sort((a, b) => a.load_pct - b.load_pct);
}

export interface AssignmentPick {
  user_email: string;
  user_name: string;
  /** Por qué se eligió a esta persona, para poder explicarlo después. */
  reason: string;
}

/**
 * Elige a quién asignar un trabajo nuevo en un espacio.
 *
 * Descarta a quien está ausente o no acepta asignación automática, prefiere a
 * quien tiene la especialidad pedida y, entre los que quedan, al menos cargado
 * en horas. Devuelve null si no hay nadie elegible: es mejor dejar la tarea sin
 * responsable para que un líder la reparta, que asignársela a alguien que está
 * de vacaciones.
 */
export async function pickAssignee(
  db: DB, spaceId: string, opts: { specialty?: string | null } = {},
): Promise<AssignmentPick | null> {
  const capacity = await spaceCapacity(db, spaceId);
  const eligible = capacity.filter(member => !member.absent && member.accepts_auto_assign !== 0);
  if (!eligible.length) return null;

  const specialty = opts.specialty?.trim().toLowerCase();
  const specialists = specialty
    ? eligible.filter(member => member.specialties.some(s => s.trim().toLowerCase() === specialty))
    : [];

  const pool = specialists.length ? specialists : eligible;
  const chosen = pool.reduce((best, member) =>
    member.load_pct < best.load_pct ? member : best, pool[0]);

  const hours = Math.round((chosen.committed_minutes / 60) * 10) / 10;
  const reason = specialists.length
    ? `Especialista en ${specialty}, con ${chosen.load_pct}% de su capacidad comprometida (${hours} h)`
    : `Menor carga del espacio: ${chosen.load_pct}% de su capacidad (${hours} h en ${chosen.open_tasks} tarea(s))`;

  return { user_email: chosen.user_email, user_name: chosen.user_name, reason };
}
