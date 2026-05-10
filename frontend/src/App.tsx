import { useState } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useIsAuthenticated, useMsal } from '@azure/msal-react';

import { loginRequest } from './auth/msal';
import Layout from './components/layout/Layout';

import Dashboard from './pages/Dashboard';
import RequestList from './pages/RequestList';
import RequestDetail from './pages/RequestDetail';
import NewRequest from './pages/NewRequest';
import AdminPanel from './pages/AdminPanel';
import MyTasks from './pages/MyTasks';
import Inventory from './pages/Inventory';
import ProcessBuilder from './pages/ProcessBuilder';

function clearMsalInteractionLock() {
  for (const key of Object.keys(sessionStorage)) {
    if (
      key.includes('interaction.status') ||
      key.includes('msal.interaction') ||
      key.includes('msal') && key.includes('request')
    ) {
      sessionStorage.removeItem(key);
    }
  }
}

function LoginGate() {
  const { instance, inProgress } = useMsal();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function handleLogin() {
    if (busy) return;

    setBusy(true);
    setMessage('');

    try {
      clearMsalInteractionLock();
      const response = await instance.loginPopup(loginRequest);
      if (response.account) {
        instance.setActiveAccount(response.account);
      }
      window.location.reload();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);

      if (msg.includes('interaction_in_progress')) {
        clearMsalInteractionLock();
        setMessage('Se limpió una sesión de inicio anterior. Intenta nuevamente.');
      } else {
        setMessage(msg);
      }

      setBusy(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #F7FAFC 0%, #EAF2FA 45%, #F2F2F0 100%)',
      flexDirection: 'column',
      gap: 24,
      padding: 24,
    }}>
      <div style={{
        width: 420,
        maxWidth: '100%',
        background: 'rgba(255,255,255,.72)',
        border: '1px solid rgba(255,255,255,.65)',
        boxShadow: '0 24px 80px rgba(12,68,124,.18)',
        borderRadius: 24,
        padding: 32,
        textAlign: 'center',
        backdropFilter: 'blur(18px)',
      }}>
        <div style={{
          width: 64,
          height: 64,
          background: '#0C447C',
          borderRadius: 18,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 18px',
          color: '#fff',
          fontSize: 26,
          fontWeight: 900,
          boxShadow: '0 12px 32px rgba(12,68,124,.28)',
        }}>
          F
        </div>

        <h1 style={{
          fontSize: 30,
          fontWeight: 900,
          color: '#111827',
          letterSpacing: -0.6,
          marginBottom: 6,
        }}>
          FlowApp
        </h1>

        <p style={{
          color: '#667085',
          fontSize: 14,
          marginBottom: 24,
        }}>
          Plataforma corporativa de procesos, aprobaciones e inventario
        </p>

        {message && (
          <div style={{
            background: '#FFF2EC',
            color: '#993C1D',
            border: '1px solid #F0997B',
            borderRadius: 12,
            padding: 12,
            fontSize: 13,
            fontWeight: 700,
            marginBottom: 16,
          }}>
            {message}
          </div>
        )}

        <button
          onClick={handleLogin}
          disabled={busy || inProgress !== 'none'}
          style={{
            width: '100%',
            background: busy || inProgress !== 'none' ? '#98A2B3' : '#0C447C',
            color: '#fff',
            border: 'none',
            borderRadius: 14,
            padding: '14px 24px',
            fontSize: 15,
            fontWeight: 900,
            cursor: busy || inProgress !== 'none' ? 'not-allowed' : 'pointer',
            boxShadow: '0 12px 32px rgba(12,68,124,.22)',
          }}
        >
          {busy || inProgress !== 'none' ? 'Iniciando...' : 'Iniciar sesión con Microsoft'}
        </button>

        <button
          onClick={() => {
            sessionStorage.clear();
            localStorage.removeItem('msal.interaction.status');
            window.location.reload();
          }}
          style={{
            marginTop: 12,
            background: 'transparent',
            border: 'none',
            color: '#185FA5',
            fontSize: 13,
            fontWeight: 800,
            cursor: 'pointer',
          }}
        >
          Reiniciar inicio de sesión
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const isAuth = useIsAuthenticated();

  if (!isAuth) {
    return <LoginGate />;
  }

  return (
    <HashRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/requests" element={<RequestList />} />
          <Route path="/mis-tareas" element={<MyTasks />} />
          <Route path="/inventario" element={<Inventory />} />
          <Route path="/requests/new" element={<NewRequest />} />
          <Route path="/requests/:id" element={<RequestDetail />} />
          <Route path="/admin" element={<AdminPanel />} />
          <Route path="/process-builder" element={<ProcessBuilder />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Layout>
    </HashRouter>
  );
}
