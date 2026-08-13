export interface WorkEventInput {
  requestId: string;
  taskId?: string | null;
  eventType: string;
  title: string;
  actorId?: string | null;
  actorName?: string | null;
  actorEmail?: string | null;
  detail?: Record<string, unknown> | null;
}

export async function recordWorkEvent(db: D1Database, event: WorkEventInput): Promise<void> {
  try {
    await db.prepare(`
      INSERT INTO work_events
        (id, request_id, task_id, event_type, title, actor_id, actor_name, actor_email, detail_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      crypto.randomUUID(), event.requestId, event.taskId ?? null,
      event.eventType, event.title,
      event.actorId ?? null, event.actorName ?? null, event.actorEmail ?? null,
      event.detail ? JSON.stringify(event.detail) : null,
    ).run();
  } catch (error) {
    console.error('WORK_EVENT_WRITE_FAILED', event.requestId, event.eventType,
      error instanceof Error ? error.message : String(error));
  }
}

export function addBusinessDays(from: Date, days: number): string {
  const result = new Date(from);
  result.setUTCHours(22, 0, 0, 0); // 17:00 de Ecuador (UTC-5)
  let remaining = Math.max(1, Math.min(Math.round(days), 365));
  while (remaining > 0) {
    result.setUTCDate(result.getUTCDate() + 1);
    const weekday = result.getUTCDay();
    if (weekday !== 0 && weekday !== 6) remaining -= 1;
  }
  return result.toISOString();
}

export function parseEventDetail(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === 'object') return value as Record<string, unknown>;
  try { return JSON.parse(String(value)) as Record<string, unknown>; }
  catch { return null; }
}
