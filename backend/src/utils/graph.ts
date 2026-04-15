import { GraphUser } from '../types';

const GRAPH = 'https://graph.microsoft.com/v1.0';

// ─── Token de aplicación (client_credentials) ───────────────────────────────
export async function getAppToken(
  tenantId: string, clientId: string, clientSecret: string, kv: KVNamespace
): Promise<string> {
  const cacheKey = 'graph_app_token';
  const cached = await kv.get(cacheKey);
  if (cached) return cached;

  const res = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:    'client_credentials',
        client_id:     clientId,
        client_secret: clientSecret,
        scope:         'https://graph.microsoft.com/.default',
      }),
    }
  );
  if (!res.ok) throw new Error(`Graph token error: ${await res.text()}`);
  const data = await res.json() as { access_token: string; expires_in: number };
  await kv.put(cacheKey, data.access_token, { expirationTtl: data.expires_in - 60 });
  return data.access_token;
}

// ─── Búsqueda inteligente de usuarios ────────────────────────────────────────
export async function searchUsers(
  query: string, token: string, limit = 15
): Promise<GraphUser[]> {
  const select = 'id,displayName,mail,userPrincipalName,jobTitle,department';
  // Busca por nombre O por cargo
  const filter = `startsWith(displayName,'${esc(query)}') or startsWith(jobTitle,'${esc(query)}')`;
  const url = `${GRAPH}/users?$select=${select}&$filter=${encodeURIComponent(filter)}&$top=${limit}&$orderby=displayName`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    // Fallback: búsqueda por $search
    const res2 = await fetch(
      `${GRAPH}/users?$select=${select}&$search=${encodeURIComponent(`"${query}"`)}&$top=${limit}`,
      { headers: { Authorization: `Bearer ${token}`, ConsistencyLevel: 'eventual' } }
    );
    if (!res2.ok) return [];
    const data2 = await res2.json() as { value: GraphUser[] };
    return data2.value ?? [];
  }
  const data = await res.json() as { value: GraphUser[] };
  return data.value ?? [];
}

// ─── Obtener usuario por OID ──────────────────────────────────────────────────
export async function getUserById(id: string, token: string): Promise<GraphUser | null> {
  const res = await fetch(
    `${GRAPH}/users/${id}?$select=id,displayName,mail,userPrincipalName,jobTitle,department`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return null;
  return res.json() as Promise<GraphUser>;
}

// ─── Envío de correo ──────────────────────────────────────────────────────────
export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments?: { name: string; contentType: string; contentBytes: string }[];
}

export async function sendMail(
  msg: MailMessage,
  senderUpn: string,
  token: string
): Promise<void> {
  const body = {
    message: {
      subject: msg.subject,
      body: { contentType: 'HTML', content: msg.html },
      toRecipients: [{ emailAddress: { address: msg.to } }],
      attachments: (msg.attachments ?? []).map(a => ({
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: a.name,
        contentType: a.contentType,
        contentBytes: a.contentBytes,
      })),
    },
    saveToSentItems: false,
  };
  const res = await fetch(`${GRAPH}/users/${senderUpn}/sendMail`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok && res.status !== 202) {
    throw new Error(`sendMail error ${res.status}: ${await res.text()}`);
  }
}

function esc(s: string) { return s.replace(/'/g, "''"); }
