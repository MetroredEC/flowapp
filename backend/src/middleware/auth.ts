import { Context, Next } from 'hono';
import { AppEnv } from '../types';

interface JwtHeader { alg: string; kid: string; }
interface JwtPayload {
  oid: string; sub: string; name: string;
  preferred_username?: string; email?: string; upn?: string;
  roles?: string[]; exp: number; iss: string; aud: string | string[];
}
interface JwkKey { kid: string; kty: string; n: string; e: string; [key: string]: unknown; }

const JWKS_CACHE_KEY = 'entra_jwks';
const JWKS_TTL = 3600;

export async function authMiddleware(c: Context<AppEnv>, next: Next): Promise<Response | void> {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'unauthorized', message: 'Token requerido' }, 401);
  }
  const token = authHeader.slice(7);
  try {
    const payload = await verifyEntraToken(token, c.env.ENTRA_TENANT_ID, c.env.ENTRA_API_AUDIENCE, c.env.KV);
    c.set('userId',    payload.oid);
    c.set('userEmail', payload.preferred_username ?? payload.email ?? payload.upn ?? '');
    c.set('userName',  payload.name ?? '');
    c.set('userRoles', payload.roles ?? []);
    await next();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Token invalido';
    return c.json({ error: 'unauthorized', message: msg }, 401);
  }
}

async function verifyEntraToken(token: string, tenantId: string, audience: string, kv: KVNamespace): Promise<JwtPayload> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('JWT malformado');
  const header: JwtHeader = JSON.parse(b64url(parts[0]));
  const payload: JwtPayload = JSON.parse(b64url(parts[1]));
  if (Date.now() / 1000 > payload.exp) throw new Error('Token expirado');
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.some(a => a === audience || a === 'api://' + audience.replace('api://', ''))) throw new Error('Audience invalido');
  const validIssuers = [
    'https://login.microsoftonline.com/' + tenantId + '/v2.0',
    'https://sts.windows.net/' + tenantId + '/'
  ];
  if (!validIssuers.includes(payload.iss)) throw new Error('Issuer invalido');
  const jwks = await getJwks(tenantId, kv);
  const key = jwks.keys.find((k) => (k as JwkKey).kid === header.kid) as JwkKey | undefined;
  if (!key) throw new Error('Clave publica no encontrada');
  const cryptoKey = await crypto.subtle.importKey('jwk', key as unknown as JsonWebKey, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const sigInput = new TextEncoder().encode(parts[0] + '.' + parts[1]);
  const sigBytes = Uint8Array.from(atob(parts[2].replace(/-/g, '+').replace(/_/g, '/')), (ch) => ch.charCodeAt(0));
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', cryptoKey, sigBytes, sigInput);
  if (!valid) throw new Error('Firma invalida');
  return payload;
}

async function getJwks(tenantId: string, kv: KVNamespace): Promise<{ keys: unknown[] }> {
  const cached = await kv.get(JWKS_CACHE_KEY);
  if (cached) return JSON.parse(cached) as { keys: unknown[] };
  const res = await fetch('https://login.microsoftonline.com/' + tenantId + '/discovery/v2.0/keys');
  const jwks = await res.json() as { keys: unknown[] };
  await kv.put(JWKS_CACHE_KEY, JSON.stringify(jwks), { expirationTtl: JWKS_TTL });
  return jwks;
}

function b64url(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  return atob(b64 + '=='.slice(0, (4 - b64.length % 4) % 4));
}