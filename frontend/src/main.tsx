import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MsalProvider } from '@azure/msal-react';
import { msalInstance } from './auth/msal';
import App from './App';

async function bootstrap() {
  await msalInstance.initialize();

  // Handle redirect result (clears interaction.status on successful redirect)
  try {
    await msalInstance.handleRedirectPromise();
  } catch {
    // If the redirect failed or was interrupted, clear any stale MSAL state
    Object.keys(sessionStorage)
      .filter(k => k === 'msal.interaction.status' || k.endsWith('.interaction.status'))
      .forEach(k => sessionStorage.removeItem(k));
  }

  // Also defensively clear if the status is stuck as the literal string "undefined"
  if (sessionStorage.getItem('msal.interaction.status') === 'undefined') {
    sessionStorage.removeItem('msal.interaction.status');
  }

  const accounts = msalInstance.getAllAccounts();
  if (accounts.length > 0) {
    msalInstance.setActiveAccount(accounts[0]);
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <MsalProvider instance={msalInstance}>
        <App />
      </MsalProvider>
    </StrictMode>
  );
}

bootstrap();