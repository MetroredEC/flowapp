import { PublicClientApplication, Configuration, LogLevel } from '@azure/msal-browser';

export const msalConfig: Configuration = {
  auth: {
    clientId:    import.meta.env.VITE_ENTRA_CLIENT_ID,
    authority:   `https://login.microsoftonline.com/${import.meta.env.VITE_ENTRA_TENANT_ID}`,
    redirectUri: window.location.origin + '/flowapp/',
    postLogoutRedirectUri: window.location.origin + '/flowapp/',
  },
  cache: {
    cacheLocation:       'sessionStorage',
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
  scopes: [import.meta.env.VITE_ENTRA_SCOPE],
};

export const msalInstance = new PublicClientApplication(msalConfig);
