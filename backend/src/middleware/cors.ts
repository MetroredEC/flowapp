import { Context, Next } from 'hono';
import { AppEnv } from '../types';

export async function corsMiddleware(c: Context<AppEnv>, next: Next): Promise<Response | void> {
  const origin = c.req.header('Origin') ?? '';
  const allowed = c.env.ALLOWED_ORIGINS.split(',').map((s: string) => s.trim());
  const allowOrigin = allowed.includes(origin) ? origin : allowed[0];

  c.header('Access-Control-Allow-Origin', allowOrigin);
  c.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  c.header('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Request-ID');
  c.header('Access-Control-Max-Age', '86400');
  c.header('Vary', 'Origin');

  if (c.req.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }
  await next();
}