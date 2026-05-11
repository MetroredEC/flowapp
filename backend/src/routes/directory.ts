import { Hono } from 'hono';
import type { AppEnv } from '../types';

const directory = new Hono<AppEnv>();

type GraphUser = {
  id: string;
  displayName?: string;
  mail?: string;
  userPrincipalName?: string;
  jobTitle?: string;
  department?: string;
};

function getEnvValue(env: unknown, names: string[]): string {
  const source = env as Record<string, string | undefined>;

  for (const name of names) {
    const value = source[name];

    if (value && String(value).trim()) {
      return String(value).trim();
    }
  }

  return '';
}

function escapeOData(value: string): string {
  return value.replace(/'/g, "''");
}

async function getGraphToken(env: unknown): Promise<string> {
  const tenantId = getEnvValue(env, [
    'MS_TENANT_ID',
    'AZURE_TENANT_ID',
    'ENTRA_TENANT_ID',
    'TENANT_ID',
    'VITE_ENTRA_TENANT_ID',
  ]);

  const clientId = getEnvValue(env, [
    'MS_GRAPH_CLIENT_ID',
    'AZURE_CLIENT_ID',
    'ENTRA_CLIENT_ID',
    'CLIENT_ID',
    'VITE_ENTRA_CLIENT_ID',
  ]);

  const clientSecret = getEnvValue(env, [
    'MS_GRAPH_CLIENT_SECRET',
    'AZURE_CLIENT_SECRET',
    'ENTRA_CLIENT_SECRET',
    'CLIENT_SECRET',
    'MICROSOFT_CLIENT_SECRET',
  ]);

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error('graph_config_missing');
  }

  const body = new URLSearchParams();
  body.set('client_id', clientId);
  body.set('client_secret', clientSecret);
  body.set('scope', 'https://graph.microsoft.com/.default');
  body.set('grant_type', 'client_credentials');

  const response = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    }
  );

  if (!response.ok) {
    const detail = await response.text();
    console.error('Graph token error', detail);
    throw new Error('graph_token_error');
  }

  const data = await response.json() as { access_token?: string };

  if (!data.access_token) {
    throw new Error('graph_token_missing');
  }

  return data.access_token;
}

directory.get('/users', async (c) => {
  const query = String(c.req.query('query') || c.req.query('q') || '').trim();

  if (query.length < 2) {
    return c.json({ data: [] });
  }

  try {
    const token = await getGraphToken(c.env);
    const safe = escapeOData(query);

    const filter = [
      `startswith(displayName,'${safe}')`,
      `startswith(mail,'${safe}')`,
      `startswith(userPrincipalName,'${safe}')`,
    ].join(' or ');

    const url =
      'https://graph.microsoft.com/v1.0/users' +
      '?$top=10' +
      '&$select=id,displayName,mail,userPrincipalName,jobTitle,department' +
      '&$filter=' + encodeURIComponent(filter);

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error('Graph users error', detail);

      return c.json({
        error: 'graph_search_error',
        message: 'No se pudo buscar usuarios en Microsoft Graph.',
      }, 502);
    }

    const data = await response.json() as { value?: GraphUser[] };

    return c.json({
      data: data.value || [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'directory_error';

    if (message === 'graph_config_missing') {
      return c.json({
        error: 'graph_config_missing',
        message: 'Faltan variables de entorno para consultar Microsoft Graph desde backend.',
      }, 500);
    }

    return c.json({
      error: message,
      message: 'No se pudo buscar aprobadores.',
    }, 500);
  }
});

export default directory;
