import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useIsAuthenticated, useMsal } from '@azure/msal-react';
import { loginRequest } from './auth/msal';
import Layout from './components/layout/Layout';
import Dashboard from './pages/Dashboard';
import RequestList from './pages/RequestList';
import RequestDetail from './pages/RequestDetail';
import NewRequest from './pages/NewRequest';
import AdminPanel from './pages/AdminPanel';

function LoginGate() {
  const { instance } = useMsal();
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#F2F2F0', flexDirection: 'column', gap: 24,
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: 56, height: 56, background: '#0C447C', borderRadius: 14,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 16px', color: '#fff', fontSize: 22, fontWeight: 800,
        }}>N</div>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: '#111', letterSpacing: -0.5 }}>FlowApp</h1>
        <p style={{ color: '#888', fontSize: 14, marginTop: 6 }}>Plataforma de aprobaciones</p>
      </div>
      <button
        onClick={() => instance.loginRedirect(loginRequest)}
        style={{
          background: '#0C447C', color: '#fff', border: 'none', borderRadius: 10,
          padding: '14px 32px', fontSize: 15, fontWeight: 700, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 10,
        }}
      >
        <MsLogo /> Iniciar sesión con Microsoft
      </button>
    </div>
  );
}

function MsLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 21 21">
      <rect x="1"  y="1"  width="9" height="9" fill="#f25022"/>
      <rect x="11" y="1"  width="9" height="9" fill="#7fba00"/>
      <rect x="1"  y="11" width="9" height="9" fill="#00a4ef"/>
      <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
    </svg>
  );
}

export default function App() {
  const isAuth = useIsAuthenticated();
  if (!isAuth) return <LoginGate />;

  return (
    <BrowserRouter basename="/flowapp">
      <Layout>
        <Routes>
          <Route path="/"               element={<Dashboard />} />
          <Route path="/requests"       element={<RequestList />} />
          <Route path="/requests/new"   element={<NewRequest />} />
          <Route path="/requests/:id"   element={<RequestDetail />} />
          <Route path="/admin"          element={<AdminPanel />} />
          <Route path="*"               element={<Navigate to="/" />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
