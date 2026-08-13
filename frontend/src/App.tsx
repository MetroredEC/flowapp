import { useState } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useIsAuthenticated, useMsal } from '@azure/msal-react';

import { loginRequest } from './auth/msal';
import Layout from './components/layout/Layout';

import RequestList from './pages/RequestList';
import RequestDetail from './pages/RequestDetail';
import NewRequest from './pages/NewRequest';
import AdminPanel from './pages/AdminPanel';
import Inventory from './pages/Inventory';
import ProcessWizard from './pages/ProcessWizard';
import MyDay from './pages/workspace/MyDay';
import Inbox from './pages/workspace/Inbox';
import SpaceBoard from './pages/workspace/SpaceBoard';
import MyTasksPage from './pages/workspace/MyTasksPage';
import Management from './pages/workspace/Management';
import Home from './pages/workspace/Home';
import MyRequests from './pages/workspace/MyRequests';
import Decisions from './pages/workspace/Decisions';
import TeamLoad from './pages/workspace/TeamLoad';
import { PersonaProvider } from './lib/persona';
import AppDialogHost from './components/AppDialog';
import SSOSales from './pages/SSOSales';

function clearMsalInteractionState() {
  // Remove stale MSAL interaction flags that can block loginRedirect
  try {
    Object.keys(sessionStorage)
      .filter(k => k === 'msal.interaction.status' || k.endsWith('.interaction.status'))
      .forEach(k => sessionStorage.removeItem(k));
  } catch { /* ignore */ }
}

function LoginGate() {
  const { instance } = useMsal();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    setLoading(true);
    setError('');
    try {
      await instance.loginRedirect(loginRequest);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('interaction_in_progress')) {
        // Clear stale MSAL state and retry automatically
        clearMsalInteractionState();
        try {
          await instance.loginRedirect(loginRequest);
          return;
        } catch { /* fall through to show error */ }
      }
      setError('No se pudo iniciar sesión. Intenta de nuevo.');
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #0891B2 0%, #0284C7 50%, #06B6D4 100%)',
      flexDirection: 'column',
      gap: 0,
      padding: 24,
    }}>
      {/* Animated background shapes */}
      <div style={{
        position: 'fixed', top: '-200px', right: '-200px', width: 600, height: 600,
        borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(255,255,255,0.1) 0%, transparent 70%)',
        pointerEvents: 'none', animation: 'float 20s ease-in-out infinite',
      }} />
      <div style={{
        position: 'fixed', bottom: '-100px', left: '-100px', width: 500, height: 500,
        borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(255,255,255,0.08) 0%, transparent 70%)',
        pointerEvents: 'none', animation: 'float 25s ease-in-out infinite reverse',
      }} />
      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-20px); }
        }
      `}</style>

      <div style={{
        background: 'rgba(255, 255, 255, 0.85)',
        border: '1px solid rgba(255, 255, 255, 0.4)',
        borderRadius: 24,
        padding: '52px 48px 48px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 0,
        backdropFilter: 'blur(20px)',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.15)',
        maxWidth: 380,
        width: '100%',
        position: 'relative',
      }}>
        {/* Logo Metrored */}
        <div style={{
          width: 70,
          height: 70,
          background: 'linear-gradient(135deg, #0284C7, #0891B2)',
          borderRadius: 18,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 24,
          boxShadow: '0 12px 32px rgba(2, 132, 199, 0.3)',
          fontSize: 32,
          fontWeight: 900,
          color: '#fff',
        }}>
          M
        </div>

        <h1 style={{ fontSize: 28, fontWeight: 900, color: '#0284C7', letterSpacing: -0.6, marginBottom: 4 }}>
          Metrored
        </h1>
        <p style={{ fontSize: 11, fontWeight: 700, color: '#0891B2', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 28 }}>
          Centros Médicos
        </p>
        <p style={{ color: '#64748B', fontSize: 15, marginBottom: 32, textAlign: 'center', lineHeight: 1.5 }}>
          Plataforma de solicitudes y aprobaciones
        </p>

        <button
          onClick={handleLogin}
          disabled={loading}
          style={{
            width: '100%',
            background: 'linear-gradient(135deg, #0284C7, #0891B2)',
            color: '#fff',
            border: 'none',
            borderRadius: 12,
            padding: '14px 24px',
            fontSize: 14,
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            transition: 'all .15s',
            boxShadow: '0 8px 24px rgba(2, 132, 199, 0.3)',
            opacity: loading ? 0.8 : 1,
          }}
          onMouseEnter={e => {
            if (!loading) {
              e.currentTarget.style.boxShadow = '0 12px 32px rgba(2, 132, 199, 0.4)';
              e.currentTarget.style.transform = 'translateY(-2px)';
            }
          }}
          onMouseLeave={e => {
            if (!loading) {
              e.currentTarget.style.boxShadow = '0 8px 24px rgba(2, 132, 199, 0.3)';
              e.currentTarget.style.transform = 'translateY(0)';
            }
          }}
        >
          {loading ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                width: 14, height: 14, borderRadius: '50%',
                border: '2px solid rgba(255,255,255,0.3)',
                borderTopColor: '#fff',
                animation: 'spin .7s linear infinite',
                flexShrink: 0,
              }} />
              Redirigiendo...
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </span>
          ) : (
            <>
              <MicrosoftIcon />
              Iniciar sesión con Microsoft
            </>
          )}
        </button>

        {error && (
          <div style={{ width: '100%', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 10, padding: '10px 14px', marginTop: 16, color: '#DC2626', fontSize: 12, textAlign: 'center' }}>
            {error}
          </div>
        )}

        <p style={{ color: '#94A3B8', fontSize: 12, marginTop: 24, textAlign: 'center' }}>
          Solo para usuarios autorizados de Metrored Centros Médicos
        </p>
      </div>
    </div>
  );
}

function MicrosoftIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 21 21" fill="none">
      <rect x="1" y="1" width="9" height="9" fill="#F25022"/>
      <rect x="11" y="1" width="9" height="9" fill="#7FBA00"/>
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF"/>
      <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
    </svg>
  );
}

export default function App() {
  const isAuth = useIsAuthenticated();

  if (!isAuth) {
    return <LoginGate />;
  }

  return (
    <HashRouter>
      <PersonaProvider>
      <Layout>
        <Routes>
          {/* La raíz no es una pantalla: enruta según la persona detectada */}
          <Route path="/" element={<Home />} />

          {/* Workspace (núcleo) */}
          <Route path="/mi-dia" element={<MyDay />} />
          <Route path="/bandeja" element={<Inbox />} />
          <Route path="/trabajo" element={<MyTasksPage />} />
          <Route path="/mis-tareas" element={<Navigate to="/trabajo" replace />} />
          <Route path="/espacio/sso" element={<SSOSales />} />
          <Route path="/espacio/:spaceId" element={<SpaceBoard />} />
          <Route path="/gerencia" element={<Management />} />

          {/* Inicios por persona */}
          <Route path="/mis-solicitudes" element={<MyRequests />} />
          <Route path="/decisiones" element={<Decisions />} />
          <Route path="/equipo" element={<TeamLoad />} />

          {/* Solicitudes (intake) */}
          <Route path="/solicitudes" element={<RequestList />} />
          <Route path="/solicitudes/nueva" element={<NewRequest />} />
          <Route path="/solicitudes/:id" element={<RequestDetail />} />
          {/* Compat rutas antiguas */}
          <Route path="/requests" element={<Navigate to="/solicitudes" />} />
          <Route path="/requests/new" element={<NewRequest />} />
          <Route path="/requests/:id" element={<RequestDetail />} />

          {/* Admin */}
          <Route path="/admin" element={<AdminPanel />} />
          <Route path="/admin/wizard" element={<ProcessWizard />} />

          {/* Módulos auxiliares (aún accesibles por URL) */}
          <Route path="/inventario" element={<Inventory />} />
          {/* Tickets legacy consolidados en Espacios */}
          <Route path="/marketing/tickets" element={<Navigate to="/espacio/marketing" />} />
          <Route path="/bi/tickets" element={<Navigate to="/espacio/bi" />} />

          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Layout>
      </PersonaProvider>
      <AppDialogHost />
    </HashRouter>
  );
}
