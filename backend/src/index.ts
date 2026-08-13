import { Hono } from 'hono';
import { cors } from 'hono/cors';

import type { AppEnv } from './types';
import { logEvent, newTraceId } from './utils/syslog';
import { runScheduledAutomations } from './utils/automation-scheduler';

import { authMiddleware } from './middleware/auth';

import requests from './routes/requests';
import admin from './routes/admin';
import adminBpm from './routes/admin-bpm';
import bpmRun from './routes/bpm-run';
import bpmTasks from './routes/bpm-tasks';
import emailActions from './routes/email-actions';
import inventory from './routes/inventory';
import supplyRequests from './routes/supply-requests';
import tickets from './routes/tickets';
import sso from './routes/sso';
import workspace from './routes/workspace';

const app = new Hono<AppEnv>();

app.use('*', cors({
  origin: (origin) => origin,
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  exposeHeaders: ['Content-Length', 'X-Trace-Id'],
  maxAge: 600,
  credentials: true,
}));

app.use('*', async (c, next) => {
  const traceId = c.req.header('X-Request-ID')?.slice(0, 120) || newTraceId('req');
  const startedAt = Date.now();
  c.set('traceId', traceId);
  c.set('requestStartedAt', startedAt);
  c.header('X-Trace-Id', traceId);

  await next();

  const status = c.res.status;
  const method = c.req.method.toUpperCase();
  const shouldLog = method !== 'OPTIONS' && (method !== 'GET' || status >= 400);
  if (shouldLog) {
    c.executionCtx.waitUntil(logEvent(c.env.DB, {
      category: 'http', action: `${method} ${c.req.path}`, ok: status < 400,
      severity: status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info',
      trace_id: traceId, source: 'api', actor: c.get('userEmail') || undefined,
      duration_ms: Date.now() - startedAt, http_status: status,
      detail: { method, path: c.req.path },
    }));
  }
});

app.get('/', (c) => {
  return c.json({
    ok: true,
    service: 'flowapp-api'
  });
});

// Rutas públicas de decisión por correo (validadas por token mágico, no por sesión):
// /review, /approve, /reject, /review-file/:key, /files/:key
app.route('/', emailActions);

app.use('/api/*', authMiddleware);

app.route('/api/requests', requests);
app.route('/api/admin', admin);
app.route('/api/bpm', adminBpm);
app.route('/api/bpm-run', bpmRun);
app.route('/api/bpm-tasks', bpmTasks);
app.route('/api/email-actions', emailActions);
app.route('/api/inventory', inventory);
app.route('/api/supply-requests', supplyRequests);
app.route('/api/tickets', tickets);
app.route('/api/sso', sso);
app.route('/api/workspace', workspace);

app.notFound((c) => {
  return c.json({
    error: 'not_found',
    path: c.req.path
  }, 404);
});

app.onError(async (err, c) => {
  const traceId = c.get('traceId') || newTraceId('err');
  await logEvent(c.env.DB, {
    category: 'http', action: 'unhandled_exception', ok: false, severity: 'error',
    trace_id: traceId, source: 'api', actor: c.get('userEmail') || undefined,
    duration_ms: Date.now() - (c.get('requestStartedAt') || Date.now()), http_status: 500,
    detail: { method: c.req.method, path: c.req.path, error: err.message, stack: err.stack },
  });

  return c.json({
    error: 'internal_error',
    message: err.message,
    trace_id: traceId,
  }, 500);
});

// El worker deja de ser solo una app HTTP: además atiende el cron que dispara
// las automatizaciones por tiempo y envía los avisos encolados.
export default {
  fetch: app.fetch,

  async scheduled(
    _event: ScheduledController, env: AppEnv['Bindings'], ctx: ExecutionContext,
  ): Promise<void> {
    ctx.waitUntil((async () => {
      const startedAt = Date.now();
      try {
        await runScheduledAutomations(env);
        await logEvent(env.DB, {
          category: 'config', action: 'scheduled_sweep', source: 'cron',
          duration_ms: Date.now() - startedAt,
        });
      } catch (error) {
        await logEvent(env.DB, {
          category: 'config', action: 'scheduled_sweep_failed', ok: false, severity: 'error',
          source: 'cron', duration_ms: Date.now() - startedAt,
          detail: { error: error instanceof Error ? error.message : String(error) },
        });
      }
    })());
  },
};
