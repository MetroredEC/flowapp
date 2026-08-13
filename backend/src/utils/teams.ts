// Notificaciones opcionales a Microsoft Teams mediante Workflows webhook.
import { logEvent } from './syslog';

interface TeamsEnv {
  TEAMS_WEBHOOK_URL?: string;
  FRONTEND_URL?: string;
  PLATFORM_URL: string;
  KV?: KVNamespace;
  DB?: D1Database;
}

type Tone = 'accent' | 'good' | 'attention' | 'warning';
const TONE_MARK: Record<Tone, string> = {
  accent: 'NUEVO', good: 'LISTO', attention: 'ATENCIÓN', warning: 'PENDIENTE',
};

export interface TeamsResult {
  ok: boolean;
  skipped?: boolean;
  status?: number;
  response?: string;
}

export function appUrl(env: TeamsEnv, hashPath: string): string {
  const base = (env.FRONTEND_URL || env.PLATFORM_URL || '').replace(/\/+$/, '');
  return `${base}/#${hashPath.startsWith('/') ? hashPath : '/' + hashPath}`;
}

export async function sendTeamsCard(env: TeamsEnv, opts: {
  title: string;
  tone?: Tone;
  facts?: { label: string; value: string }[];
  url?: string;
  urlLabel?: string;
  traceId?: string;
  refType?: string;
  refId?: string;
  source?: string;
}): Promise<TeamsResult> {
  const startedAt = Date.now();
  const webhook = env.TEAMS_WEBHOOK_URL;
  const eventBase = {
    trace_id: opts.traceId, source: opts.source || 'teams-webhook',
    ref_type: opts.refType, ref_id: opts.refId,
  };

  if (!webhook) {
    if (env.DB) await logEvent(env.DB, {
      ...eventBase, category: 'teams', action: 'skipped_no_webhook', ok: false, severity: 'warn',
      duration_ms: Date.now() - startedAt, detail: { title: opts.title },
    });
    return { ok: false, skipped: true };
  }

  const tone = opts.tone ?? 'accent';
  const body: unknown[] = [{
    type: 'TextBlock', text: `${TONE_MARK[tone]} · ${opts.title}`,
    weight: 'Bolder', size: 'Medium', wrap: true,
  }];
  if (opts.facts?.length) body.push({
    type: 'FactSet', facts: opts.facts.map(f => ({ title: f.label, value: f.value })),
  });

  const card = {
    type: 'AdaptiveCard', $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    version: '1.4', body,
    actions: opts.url ? [{ type: 'Action.OpenUrl', title: opts.urlLabel ?? 'Abrir en FlowApp', url: opts.url }] : [],
    msteams: { width: 'Full' },
  };

  try {
    const res = await fetch(webhook, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'message',
        attachments: [{ contentType: 'application/vnd.microsoft.card.adaptive', contentUrl: null, content: card }],
      }),
    });
    const response = await res.text().catch(() => '');
    if (env.DB) await logEvent(env.DB, {
      ...eventBase, category: 'teams', action: res.ok ? 'card_sent' : 'card_rejected', ok: res.ok,
      severity: res.ok ? 'info' : 'error', duration_ms: Date.now() - startedAt, http_status: res.status,
      detail: { title: opts.title, response: response.slice(0, 500) || '(vacía)' },
    });
    return { ok: res.ok, status: res.status, response: response.slice(0, 500) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (env.DB) await logEvent(env.DB, {
      ...eventBase, category: 'teams', action: 'card_send_failed', ok: false, severity: 'error',
      duration_ms: Date.now() - startedAt, detail: { title: opts.title, error: message },
    });
    return { ok: false, response: message };
  }
}
