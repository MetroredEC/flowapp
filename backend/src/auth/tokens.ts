export interface TokenPayload {
  stepId: string;
  requestId: string;
  action: 'approve' | 'reject';
  exp: number;
}

export type TokenError =
  | 'invalid_format'
  | 'invalid_signature'
  | 'invalid_payload'
  | 'expired'
  | 'not_found'
  | 'already_used';

export async function createMagicToken(
  payload: TokenPayload, secret: string, db: D1Database
): Promise<string> {
  const enc = b64urlEncode(JSON.stringify(payload));
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, te(enc));
  const sigB64 = b64urlEncodeBytes(new Uint8Array(sig));
  const token = `${enc}.${sigB64}`;
  const hash = await sha256(token);

  await db.prepare(
    `INSERT INTO approval_tokens (step_id, request_id, action, token_hash, expires_at)
     VALUES (?, ?, ?, ?, datetime('now', '+72 hours'))`
  ).bind(payload.stepId, payload.requestId, payload.action, hash).run();

  return token;
}

export async function verifyMagicToken(
  token: string, secret: string, db: D1Database
): Promise<{ ok: true; payload: TokenPayload } | { ok: false; error: TokenError }> {
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, error: 'invalid_format' };
  const [enc, sigB64] = parts;

  const key = await hmacKey(secret);
  let sigBytes: Uint8Array;
  try { sigBytes = b64urlBytes(sigB64); }
  catch { return { ok: false, error: 'invalid_format' }; }

  const valid = await crypto.subtle.verify('HMAC', key, sigBytes, te(enc));
  if (!valid) return { ok: false, error: 'invalid_signature' };

  let payload: TokenPayload;
  try { payload = JSON.parse(b64urlDecodeText(enc)); }
  catch { return { ok: false, error: 'invalid_payload' }; }

  if (!payload.stepId || !payload.requestId || !['approve', 'reject'].includes(payload.action)) {
    return { ok: false, error: 'invalid_payload' };
  }
  if (Date.now() > Number(payload.exp)) return { ok: false, error: 'expired' };

  const hash = await sha256(token);
  const row = await db.prepare(
    `SELECT used_at, expires_at,
            CASE WHEN datetime('now') > expires_at THEN 1 ELSE 0 END as is_expired
       FROM approval_tokens
      WHERE token_hash = ?`
  ).bind(hash).first<{ used_at: string | null; expires_at: string; is_expired: number }>();

  if (!row) return { ok: false, error: 'not_found' };
  if (row.used_at) return { ok: false, error: 'already_used' };
  if (row.is_expired) return { ok: false, error: 'expired' };

  return { ok: true, payload };
}

export async function consumeMagicToken(token: string, db: D1Database): Promise<boolean> {
  const hash = await sha256(token);
  const result = await db.prepare(
    "UPDATE approval_tokens SET used_at = datetime('now') WHERE token_hash = ? AND used_at IS NULL"
  ).bind(hash).run();
  const changes = (result.meta as { changes?: number } | undefined)?.changes ?? 0;
  return changes > 0;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', te(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', te(s));
  return b64urlEncodeBytes(new Uint8Array(buf));
}

function te(s: string): Uint8Array { return new TextEncoder().encode(s); }

function b64urlEncode(s: string): string {
  return b64urlEncodeBytes(te(s));
}

function b64urlEncodeBytes(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function b64urlDecodeText(s: string): string {
  return atob(toBase64(s));
}

function b64urlBytes(s: string): Uint8Array {
  const b64 = toBase64(s);
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

function toBase64(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  return b64 + '=='.slice(0, (4 - b64.length % 4) % 4);
}
