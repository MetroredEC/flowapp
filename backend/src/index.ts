import { Hono } from 'hono';
import { cors } from 'hono/cors';

import type { AppEnv } from './types';

import { authMiddleware } from './middleware/auth';

import requests from './routes/requests';
import admin from './routes/admin';
import adminBpm from './routes/admin-bpm';
import bpmRun from './routes/bpm-run';
import bpmTasks from './routes/bpm-tasks';
import processBuilderRoutes from './routes/process-builder';
import emailActions from './routes/email-actions';
import inventory from './routes/inventory';

const app = new Hono<AppEnv>();

app.use('*', cors({
 origin: (origin) => origin,
 allowHeaders: ['Content-Type', 'Authorization'],
 allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
 exposeHeaders: ['Content-Length'],
 maxAge: 600,
 credentials: true,
}));

app.get('/', (c) => {
 return c.json({
  ok: true,
  service: 'flowapp-api'
 });
});

app.use('/api/*', authMiddleware);

app.route('/api/requests', requests);
app.route('/api/admin', admin);
app.route('/api/bpm', adminBpm);
app.route('/api/bpm-run', bpmRun);
app.route('/api/bpm-tasks', bpmTasks);
app.route('/api/process-builder', processBuilderRoutes);
app.route('/api/email-actions', emailActions);
app.route('/api/inventory', inventory);

app.notFound((c) => {
 return c.json({
  error: 'not_found',
  path: c.req.path
 }, 404);
});

app.onError((err, c) => {
 console.error(err);

 return c.json({
  error: 'internal_error',
  message: err.message
 }, 500);
});

export default app;
