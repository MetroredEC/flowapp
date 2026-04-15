export interface TokenPayload {
  stepId: string; requestId: string; action: 'approve' | 'reject'; exp: number;
}

export async function createMagicToken(
  payload: TokenPayload, secret: string, db: D1Database
): Promise<string> {
  const enc = btoa(JSON.stringify(payload)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, te(enc));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
  const token = `${enc}.${sigB64}`;
  const hash  = await sha256(token);

  await db.prepare(
    `INSERT INTO approval_tokens (step_id, request_id, action, token_hash, expires_at)
     VALUES (?, ?, ?, ?, datetime('now', '+72 hours'))`
  ).bind(payload.stepId, payload.requestId, payload.action, hash).run();

  return token;
}

export async function verifyMagicToken(
  token: string, secret: string, db: D1Database
): Promise<{ ok: true; payload: TokenPayload } | { ok: false; error: string }> {
  const parts = token.split('.');
  if (parts.length !== 2) return { ok: false, error: 'Formato inválido' };
  const [enc, sigB64] = parts;

  const key = await hmacKey(secret);
  const sigBytes = b64urlBytes(sigB64);
  const valid = await crypto.subtle.verify('HMAC', key, sigBytes, te(enc));
  if (!valid) return { ok: false, error: 'Firma inválida' };

  let payload: TokenPayload;
  try { payload = JSON.parse(atob(enc.replace(/-/g,'+').replace(/_/g,'/'))); }
  catch { return { ok: false, error: 'Payload inválido' }; }

  if (Date.now() > payload.exp) return { ok: false, error: 'Enlace expirado' };

  const hash = await sha256(token);
  const row = await db.prepare(
    'SELECT used_at, expires_at FROM approval_tokens WHERE token_hash = ?'
  ).bind(hash).first<{ used_at: string | null; expires_at: string }>();

  if (!row) return { ok: false, error: 'Token no encontrado' };
  if (row.used_at) return { ok: false, error: 'Enlace ya utilizado' };

  return { ok: true, payload };
}

export async function consumeMagicToken(token: string, db: D1Database): Promise<void> {
  const hash = await sha256(token);
  await db.prepare(
    "UPDATE approval_tokens SET used_at = datetime('now') WHERE token_hash = ?"
  ).bind(hash).run();
}

// helpers
async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', te(secret), { name:'HMAC', hash:'SHA-256' }, false, ['sign','verify']);
}
async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', te(s));
  return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
}
function te(s: string) { return new TextEncoder().encode(s); }
function b64urlBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g,'+').replace(/_/g,'/');
  return Uint8Array.from(atob(b64 + '=='.slice(0,(4-b64.length%4)%4)), c => c.charCodeAt(0));
}
