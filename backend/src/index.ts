import { Hono } from 'hono';
import { AppEnv } from './types';
import { corsMiddleware } from './middleware/cors';
import { authMiddleware } from './middleware/auth';
import requestsRouter from './routes/requests';
import adminRouter from './routes/admin';
import emailActionsRouter from './routes/email-actions';

const app = new Hono<AppEnv>();

// ─── CORS global ─────────────────────────────────────────────────────────────
app.use('*', corsMiddleware);

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (c) => c.json({ ok: true, ts: Date.now() }));

// ─── Magic links (sin auth — validan su propio token) ────────────────────────
app.route('/approve', emailActionsRouter);
app.route('/reject',  emailActionsRouter);
app.route('/api/approve', emailActionsRouter);
app.route('/api/reject',  emailActionsRouter);
app.route('/api/files',   emailActionsRouter);

// ─── API autenticada ──────────────────────────────────────────────────────────
const api = new Hono<AppEnv>();
api.use('*', authMiddleware);

api.route('/requests', requestsRouter);
api.route('/admin',    adminRouter);

app.route('/api', api);

// ─── 404 ──────────────────────────────────────────────────────────────────────
app.notFound((c) => c.json({ error: 'not_found', path: c.req.path }, 404));
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'internal_error', message: err.message }, 500);
});

export default app;
