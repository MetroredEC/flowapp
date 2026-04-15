import { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useMsal } from '@azure/msal-react';

const NAV = [
  { to: '/',         label: 'Dashboard',   icon: '▦' },
  { to: '/requests', label: 'Solicitudes',  icon: '☰' },
  { to: '/admin',    label: 'Administrar',  icon: '⚙' },
];

export default function Layout({ children }: { children: ReactNode }) {
  const { instance, accounts } = useMsal();
  const user = accounts[0];
  const navigate = useNavigate();

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#F2F2F0' }}>
      {/* Sidebar */}
      <aside style={{
        width: 220, background: '#0C447C', display: 'flex', flexDirection: 'column',
        position: 'sticky', top: 0, height: '100vh', flexShrink: 0,
      }}>
        {/* Logo */}
        <div style={{ padding: '24px 20px 20px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <span style={{ color: '#fff', fontSize: 20, fontWeight: 800, letterSpacing: -0.5 }}>FlowApp</span>
          <div style={{ color: '#B5D4F4', fontSize: 11, marginTop: 2 }}>Aprobaciones</div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '16px 12px' }}>
          {NAV.map(({ to, label, icon }) => (
            <NavLink key={to} to={to} end={to === '/'}
              style={({ isActive }) => ({
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 12px', borderRadius: 8, marginBottom: 4,
                textDecoration: 'none', fontSize: 14, fontWeight: 500,
                background: isActive ? 'rgba(255,255,255,0.15)' : 'transparent',
                color: isActive ? '#fff' : '#B5D4F4',
                transition: 'all .15s',
              })}
            >
              <span style={{ fontSize: 16, width: 20, textAlign: 'center' }}>{icon}</span>
              {label}
            </NavLink>
          ))}
        </nav>

        {/* New request button */}
        <div style={{ padding: '0 12px 16px' }}>
          <button
            onClick={() => navigate('/requests/new')}
            style={{
              width: '100%', background: '#1D9E75', color: '#fff', border: 'none',
              borderRadius: 8, padding: '11px 0', fontSize: 14, fontWeight: 700,
              cursor: 'pointer',
            }}
          >+ Nueva solicitud</button>
        </div>

        {/* User */}
        <div style={{
          padding: '14px 16px', borderTop: '1px solid rgba(255,255,255,0.1)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%', background: '#378ADD',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 13, fontWeight: 700, flexShrink: 0,
          }}>
            {user?.name?.charAt(0)?.toUpperCase() ?? '?'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: '#fff', fontSize: 12, fontWeight: 600,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.name ?? ''}
            </div>
          </div>
          <button
            onClick={() => instance.logoutRedirect()}
            title="Cerrar sesión"
            style={{ background: 'none', border: 'none', color: '#B5D4F4',
              cursor: 'pointer', fontSize: 14, padding: 4 }}
          >⇥</button>
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, overflow: 'auto' }}>
        {children}
      </main>
    </div>
  );
}
