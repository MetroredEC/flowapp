import { StrictMode } from 'react';
import './index.css';
import { createRoot } from 'react-dom/client';
import './index.css';
import { MsalProvider } from '@azure/msal-react';
import './index.css';
import { msalInstance } from './auth/msal';
import './index.css';
import App from './App';
import ErrorBoundary from './components/feedback/ErrorBoundary';
import './index.css';

async function bootstrap() {
  await msalInstance.initialize();
  await msalInstance.handleRedirectPromise();

  const accounts = msalInstance.getAllAccounts();
  if (accounts.length > 0) {
    msalInstance.setActiveAccount(accounts[0]);
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <MsalProvider instance={msalInstance}>
        <ErrorBoundary>
    <App />
  </ErrorBoundary>
      </MsalProvider>
    </StrictMode>
  );
}

bootstrap();