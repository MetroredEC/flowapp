// Registro central de eventos. Nunca lanza: observar la plataforma no debe romperla.

export type SysCategory =
  | 'request' | 'approval' | 'email' | 'teams' | 'task' | 'notify' | 'sale'
  | 'http' | 'auth' | 'diagnostic' | 'file' | 'config';

export interface SysEvent {
  category: SysCategory;
  action: string;
  ok?: boolean;
  severity?: 'debug' | 'info' | 'warn' | 'error';
  trace_id?: string;
  source?: string;
  ref_type?: string;
  ref_id?: string;
  actor?: string;
  duration_ms?: number;
  http_status?: number;
  detail?: unknown;
}

const SECRET_KEY = /token|secret|password|authorization|webhook|cookie|signature/i;
const MAX_TEXT = 4_000;

export function newTraceId(prefix = 'evt'): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 5) return '[max-depth]';
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.length > MAX_TEXT ? `${value.slice(0, MAX_TEXT)}…` : value;
  if (Array.isArray(value)) return value.slice(0, 50).map(v => sanitize(v, depth + 1));
  if (typeof value === 'object') {
    const safe: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 80)) {
      safe[key] = SECRET_KEY.test(key) ? '[redacted]' : sanitize(item, depth + 1);
    }
    return safe;
  }
  return String(value);
}

function serialize(value: unknown): string | null {
  if (value == null) return null;
  try {
    const text = JSON.stringify(sanitize(value));
    return text.length > 12_000 ? `${text.slice(0, 12_000)}…` : text;
  } catch {
    return JSON.stringify({ value: String(value) });
  }
}

export async function logEvent(db: D1Database, event: SysEvent): Promise<void> {
  const ok = event.ok !== false;
  const traceId = event.trace_id || event.ref_id || newTraceId();
  const severity = event.severity || (ok ? 'info' : 'error');
  const safeDetail = sanitize(event.detail);
  const detail = serialize(safeDetail);
  const eventId = crypto.randomUUID();
  const consoleEvent = {
    event: 'flowapp.sys_event', event_id: eventId, trace_id: traceId,
    category: event.category, action: event.action, ok, severity,
    source: event.source || null, ref_type: event.ref_type || null,
    ref_id: event.ref_id || null, actor: event.actor || null,
    duration_ms: event.duration_ms ?? null, http_status: event.http_status ?? null,
    detail: safeDetail ?? null,
  };

  try {
    await db.prepare(`
      INSERT INTO sys_events
        (id, category, action, ok, severity, trace_id, source, ref_type, ref_id, actor, duration_ms, http_status, detail)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      eventId, event.category, event.action, ok ? 1 : 0, severity, traceId,
      event.source ?? null, event.ref_type ?? null, event.ref_id ?? null,
      event.actor ?? null, event.duration_ms ?? null, event.http_status ?? null, detail,
    ).run();
    console.log(JSON.stringify(consoleEvent));
  } catch (error) {
    console.error(JSON.stringify({
      event: 'flowapp.syslog_write_failed', event_id: eventId, trace_id: traceId,
      category: event.category, action: event.action,
      error: error instanceof Error ? error.message : String(error),
    }));
  }
}
