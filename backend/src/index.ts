import { Hono } from 'hono';
import { AppEnv } from './types';
import { corsMiddleware } from './middleware/cors';
import { authMiddleware } from './middleware/auth';
import requestsRouter from './routes/requests';
import adminRouter from './routes/admin';
import emailActionsRouter from './routes/email-actions';

const app = new Hono<AppEnv>();

app.use('*', corsMiddleware);

app.get('/health', (c) => c.json({ ok: true, ts: Date.now() }));

app.get('/approve', async (c) => {
  const token = c.req.query('token') ?? '';
  return emailActionsRouter.request('/approve?token=' + token, {}, c.env);
});
app.get('/reject', async (c) => {
  const token = c.req.query('token') ?? '';
  const comment = c.req.query('comment') ?? '';
  const url = '/reject?token=' + token + (comment ? '&comment=' + encodeURIComponent(comment) : '');
  return emailActionsRouter.request(url, {}, c.env);
});
app.get('/api/files/*', async (c) => {
  const key = c.req.path.replace('/api/files/', '');
  return emailActionsRouter.request('/files/' + key, {}, c.env);
});

const api = new Hono<AppEnv>();
api.use('*', corsMiddleware);
api.use('*', authMiddleware);
api.route('/requests', requestsRouter);
api.route('/admin',    adminRouter);

app.route('/api', api);

app.notFound((c) => c.json({ error: 'not_found', path: c.req.path }, 404));
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'internal_error', message: err.message }, 500);
});

export default app;