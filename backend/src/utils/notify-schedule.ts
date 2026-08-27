// Cuándo avisar al aprobador.
//
// Hasta ahora la notificación salía siempre al enviar. Hay procesos cuya
// aprobación debe empezar en una fecha futura -- una campaña que arranca el mes
// que viene, un permiso que se pide con antelación -- y adelantar el aviso hace
// que el aprobador lo vea cuando todavía no puede decidir, y lo olvide cuando sí.
//
// Tres modos, combinables con la elección del solicitante:
//   immediate  = al enviar, como siempre
//   fixed      = N días después del envío
//   from_field = a partir de una fecha que el propio formulario capturó
//
// Si el proceso permite que el solicitante elija, su fecha manda sobre la regla:
// quien pide es quien sabe cuándo lo necesita.

export interface NotifyRule {
  notify_mode: string | null;
  notify_field_key: string | null;
  notify_offset_days: number | null;
  notify_time: string | null;
  allow_requester_schedule: number | null;
}

/** Hora por defecto del aviso programado, en hora de Ecuador (UTC-5). */
const DEFAULT_HOUR = '08:00';
const EC_OFFSET_HOURS = 5;

/** Convierte fecha local de Ecuador + hora a un instante UTC en ISO. */
function toUtcIso(dateKey: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null;
  const clean = /^\d{2}:\d{2}$/.test(time) ? time : DEFAULT_HOUR;
  const local = Date.parse(`${dateKey}T${clean}:00Z`);
  if (Number.isNaN(local)) return null;
  return new Date(local + EC_OFFSET_HOURS * 3600 * 1000).toISOString();
}

function addDays(dateKey: string, days: number): string {
  const base = Date.parse(`${dateKey}T12:00:00Z`);
  return new Date(base + days * 86400000).toISOString().slice(0, 10);
}

/** Día operativo de Ecuador. */
export function todayEc(): string {
  return new Date(Date.now() - EC_OFFSET_HOURS * 3600 * 1000).toISOString().slice(0, 10);
}

/**
 * Momento en que debe salir el aviso, o null para enviarlo ya.
 *
 * Una fecha que ya pasó no se programa: se notifica de inmediato. Programar
 * hacia el pasado dejaría la solicitud esperando un barrido que la trataría
 * como vencida sin que nadie la haya visto.
 */
export function resolveNotifyAt(
  rule: NotifyRule | null,
  formFields: Record<string, unknown> | null,
  requesterChoice?: string | null,
): string | null {
  const time = rule?.notify_time && /^\d{2}:\d{2}$/.test(rule.notify_time)
    ? rule.notify_time : DEFAULT_HOUR;

  let iso: string | null = null;

  // La elección del solicitante manda cuando el proceso la permite.
  if (rule?.allow_requester_schedule && requesterChoice) {
    iso = /^\d{4}-\d{2}-\d{2}$/.test(requesterChoice)
      ? toUtcIso(requesterChoice, time)
      : (Number.isNaN(Date.parse(requesterChoice)) ? null : new Date(requesterChoice).toISOString());
  }

  if (!iso) {
    const mode = rule?.notify_mode ?? 'immediate';
    const offset = Number(rule?.notify_offset_days ?? 0) || 0;

    if (mode === 'fixed') {
      iso = toUtcIso(addDays(todayEc(), offset), time);
    } else if (mode === 'from_field' && rule?.notify_field_key) {
      const raw = formFields?.[rule.notify_field_key];
      const dateKey = String(raw ?? '').match(/^\d{4}-\d{2}-\d{2}/)?.[0];
      // Sin fecha utilizable se avisa ya: es preferible un aviso temprano a una
      // solicitud que nadie mira porque su fecha nunca se pudo calcular.
      if (dateKey) iso = toUtcIso(addDays(dateKey, offset), time);
    }
  }

  if (!iso) return null;
  return Date.parse(iso) > Date.now() ? iso : null;
}
