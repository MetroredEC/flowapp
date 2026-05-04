import { GraphUser } from '../types';

const GRAPH = 'https://graph.microsoft.com/v1.0';
const USER_SELECT = 'id,displayName,mail,userPrincipalName,jobTitle,department';

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
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'https://graph.microsoft.com/.default',
      }),
    }
  );
  if (!res.ok) throw new Error(`Graph token error: ${await res.text()}`);
  const data = await res.json() as { access_token: string; expires_in: number };
  await kv.put(cacheKey, data.access_token, { expirationTtl: Math.max(60, data.expires_in - 60) });
  return data.access_token;
}

export async function searchUsers(
  query: string, token: string, limit = 15
): Promise<GraphUser[]> {
  const q = escapeODataString(query.trim());
  if (!q) return [];

  const filter = `startsWith(displayName,'${q}') or startsWith(mail,'${q}') or startsWith(userPrincipalName,'${q}') or startsWith(jobTitle,'${q}')`;
  const url = `${GRAPH}/users?$select=${USER_SELECT}&$filter=${encodeURIComponent(filter)}&$top=${limit}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.ok) {
    const data = await res.json() as { value: GraphUser[] };
    if (data.value?.length) return data.value;
  }

  const searchUrl = `${GRAPH}/users?$select=${USER_SELECT}&$search=${encodeURIComponent('"displayName:' + query.trim() + '"')}&$top=${limit}`;
  const res2 = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${token}`, ConsistencyLevel: 'eventual' }
  });
  if (!res2.ok) return [];
  const data2 = await res2.json() as { value: GraphUser[] };
  return data2.value ?? [];
}

export async function getUserById(id: string, token: string): Promise<GraphUser | null> {
  const res = await fetch(
    `${GRAPH}/users/${encodeURIComponent(id)}?$select=${USER_SELECT}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return null;
  return res.json() as Promise<GraphUser>;
}

export async function getFirstUserByJobTitle(jobTitle: string, token: string): Promise<GraphUser | null> {
  const title = escapeODataString(jobTitle.trim());
  if (!title) return null;

  const exactFilter = `jobTitle eq '${title}'`;
  const exactUrl = `${GRAPH}/users?$select=${USER_SELECT}&$filter=${encodeURIComponent(exactFilter)}&$top=1`;
  const exactRes = await fetch(exactUrl, { headers: { Authorization: `Bearer ${token}` } });
  if (exactRes.ok) {
    const data = await exactRes.json() as { value: GraphUser[] };
    const first = data.value?.find(userHasMail) ?? data.value?.[0];
    if (first) return first;
  }

  const matches = await searchUsers(jobTitle, token, 10);
  return matches.find(u => (u.jobTitle ?? '').toLowerCase() === jobTitle.trim().toLowerCase() && userHasMail(u))
    ?? matches.find(userHasMail)
    ?? matches[0]
    ?? null;
}

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  attachments?: { name: string; contentType: string; contentBytes: string }[];
}

export async function sendMail(
  msg: MailMessage,
  senderUpn: string,
  token: string
): Promise<void> {
  if (!msg.to?.trim()) throw new Error('Destinatario de correo vacio');
  if (!senderUpn?.trim()) throw new Error('Remitente de correo vacio');

  const message: Record<string, unknown> = {
    subject: msg.subject,
    body: { contentType: 'HTML', content: msg.html },
    toRecipients: [{ emailAddress: { address: msg.to.trim() } }],
  };

  if (msg.replyTo?.trim()) {
    message.replyTo = [{ emailAddress: { address: msg.replyTo.trim() } }];
  }
  if (msg.attachments?.length) {
    message.attachments = msg.attachments.map(a => ({
      '@odata.type': '#microsoft.graph.fileAttachment',
      name: a.name,
      contentType: a.contentType,
      contentBytes: a.contentBytes,
    }));
  }

  const body = { message, saveToSentItems: false };
  const res = await fetch(`${GRAPH}/users/${encodeURIComponent(senderUpn.trim())}/sendMail`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok && res.status !== 202) {
    throw new Error(`sendMail error ${res.status}: ${await res.text()}`);
  }
}

function escapeODataString(value: string): string {
  return value.replace(/'/g, "''");
}

function userHasMail(u: GraphUser): boolean {
  return Boolean((u.mail ?? u.userPrincipalName)?.trim());
}
