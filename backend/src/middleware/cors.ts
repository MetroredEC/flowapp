import { cors } from 'hono/cors';
import { MiddlewareHandler } from 'hono';
import { AppEnv } from '../types';

export const corsMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
 const allowedOrigins = c.env.ALLOWED_ORIGINS.split(',').map((s: string) => s.trim());
 return cors({
  origin: allowedOrigins,
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  maxAge: 86400,
 })(c, next);
};