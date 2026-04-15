import { MiddlewareHandler } from 'hono';
import { AppEnv } from '../types';

export const corsMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const origin = c.req.header('Origin') ?? '';
  const allowed = c.env.ALLOWED_ORIGINS.split(',').map(s => s.trim());
  const allowOrigin = allowed.includes(origin) ? origin : allowed[0];

  c.header('Access-Control-Allow-Origin', allowOrigin);
  c.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  c.header('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Request-ID');
  c.header('Access-Control-Max-Age', '86400');
  c.header('Vary', 'Origin');

  if (c.req.method === 'OPTIONS') return c.text('', 204);
  await next();
};
