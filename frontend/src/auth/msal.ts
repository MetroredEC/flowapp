import { PublicClientApplication, Configuration, LogLevel } from '@azure/msal-browser';

// Fallback values ensure login never fails due to missing env vars at build time
const CLIENT_ID  = import.meta.env.VITE_ENTRA_CLIENT_ID  ?? '66130291-fc50-43f1-943c-6818dac1ba99';
const TENANT_ID  = import.meta.env.VITE_ENTRA_TENANT_ID  ?? '480bd49c-6f89-4faa-b39e-c7728d95d130';
const SCOPE      = import.meta.env.VITE_ENTRA_SCOPE       ?? 'api://66130291-fc50-43f1-943c-6818dac1ba99/basedeconocimiento';

export const msalConfig: Configuration = {
  auth: {
    clientId:               CLIENT_ID,
    authority:              `https://login.microsoftonline.com/${TENANT_ID}`,
    redirectUri:            window.location.origin + '/flowapp/',
    postLogoutRedirectUri:  window.location.origin + '/flowapp/',
  },
  cache: {
    cacheLocation:          'sessionStorage',
    storeAuthStateInCookie: false,
  },
  system: {
    loggerOptions: {
      loggerCallback: (level, message, containsPii) => {
        if (containsPii) return;
        if (import.meta.env.DEV) console.log(`[MSAL][${LogLevel[level]}] ${message}`);
      },
      logLevel: LogLevel.Warning,
    },
  },
};

export const loginRequest = {
  scopes: [SCOPE],
};

export const msalInstance = new PublicClientApplication(msalConfig);
