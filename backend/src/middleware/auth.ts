import { MiddlewareHandler } from 'hono';
import { AppEnv } from '../types';

interface JwtHeader { alg: string; kid: string; }
interface JwtPayload {
  oid: string; sub: string; name: string;
  preferred_username?: string; email?: string; upn?: string;
  roles?: string[]; exp: number; iss: string; aud: string | string[];
}

const JWKS_CACHE_KEY = 'entra_jwks';
const JWKS_TTL = 3600; // 1 hora

export const authMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'unauthorized', message: 'Token requerido' }, 401);
  }
  const token = authHeader.slice(7);

  try {
    const payload = await verifyEntraToken(
      token,
      c.env.ENTRA_TENANT_ID,
      c.env.ENTRA_API_AUDIENCE,
      c.env.KV
    );
    c.set('userId',    payload.oid);
    c.set('userEmail', payload.preferred_username ?? payload.email ?? payload.upn ?? '');
    c.set('userName',  payload.name ?? '');
    c.set('userRoles', payload.roles ?? []);
    await next();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Token inválido';
    return c.json({ error: 'unauthorized', message: msg }, 401);
  }
};

async function verifyEntraToken(
  token: string,
  tenantId: string,
  audience: string,
  kv: KVNamespace
): Promise<JwtPayload> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('JWT malformado');

  const header: JwtHeader = JSON.parse(b64url(parts[0]));
  const payload: JwtPayload = JSON.parse(b64url(parts[1]));

  // Validar expiración
  if (Date.now() / 1000 > payload.exp) throw new Error('Token expirado');

  // Validar audience
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.some(a => a === audience || a === 'api://' + audience.replace('api://', ''))) {
    throw new Error('Audience inválido');
  }

  // Validar issuer
  const expectedIss = `https://login.microsoftonline.com/${tenantId}/v2.0`;
  if (payload.iss !== expectedIss) throw new Error('Issuer inválido');

  // Obtener JWKS (con cache en KV)
  const jwks = await getJwks(tenantId, kv);
  const key = jwks.keys?.find((k: { kid: string }) => k.kid === header.kid);
  if (!key) throw new Error('Clave pública no encontrada');

  // Verificar firma RS256
  const cryptoKey = await crypto.subtle.importKey(
    'jwk', key,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['verify']
  );
  const sigInput = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const sigBytes = Uint8Array.from(atob(parts[2].replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', cryptoKey, sigBytes, sigInput);
  if (!valid) throw new Error('Firma inválida');

  return payload;
}

async function getJwks(tenantId: string, kv: KVNamespace): Promise<{ keys: unknown[] }> {
  const cached = await kv.get(JWKS_CACHE_KEY);
  if (cached) return JSON.parse(cached);
  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`);
  const jwks = await res.json() as { keys: unknown[] };
  await kv.put(JWKS_CACHE_KEY, JSON.stringify(jwks), { expirationTtl: JWKS_TTL });
  return jwks;
}

function b64url(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  return atob(b64 + '=='.slice(0, (4 - b64.length % 4) % 4));
}
