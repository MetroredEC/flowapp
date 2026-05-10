import { PublicClientApplication, LogLevel } from '@azure/msal-browser';

const tenantId = import.meta.env.VITE_ENTRA_TENANT_ID || '480bd49c-6f89-4faa-b39e-c7728d95d130';
const clientId = import.meta.env.VITE_ENTRA_CLIENT_ID || '66130291-fc50-43f1-943c-6818dac1ba99';
const scope =
  import.meta.env.VITE_ENTRA_API_SCOPE ||
  import.meta.env.VITE_API_SCOPE ||
  import.meta.env.VITE_ENTRA_SCOPE ||
  'api://66130291-fc50-43f1-943c-6818dac1ba99/basedeconocimiento';

export const msalConfig = {
  auth: {
    clientId,
    authority: 'https://login.microsoftonline.com/' + tenantId,
    redirectUri: window.location.origin + '/flowapp/blank.html',
    postLogoutRedirectUri: window.location.origin + '/flowapp/',
    navigateToLoginRequestUrl: false,
  },
  cache: {
    cacheLocation: 'sessionStorage' as const,
    storeAuthStateInCookie: false,
  },
  system: {
    loggerOptions: {
      loggerCallback: () => {},
      logLevel: LogLevel.Warning,
      piiLoggingEnabled: false,
    },
  },
};

export const loginRequest = {
  scopes: [scope],
};

export const msalInstance = new PublicClientApplication(msalConfig);
