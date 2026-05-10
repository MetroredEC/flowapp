import { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useMsal } from '@azure/msal-react';

const NAV = [
  { to: '/', label: 'Inicio', icon: '01', description: 'Panel principal' },
  { to: '/requests', label: 'Solicitudes', icon: '02', description: 'Seguimiento' },
  { to: '/requests/new', label: 'Crear solicitud', icon: '03', description: 'Solicitar' },
  { to: '/mis-tareas', label: 'Mis tareas', icon: '04', description: 'Pendientes' },
  { to: '/inventario', label: 'Inventario', icon: '05', description: 'Kardex y stock' },
  { to: '/process-builder', label: 'Procesos', icon: '06', description: 'Diseno de procesos' },
  { to: '/admin', label: 'Administrar', icon: '07', description: 'Parametros' },
];

export default function Layout({ children }: { children: ReactNode }) {
  const { instance, accounts } = useMsal();
  const navigate = useNavigate();
  const user = accounts[0];

  const initials = (user?.name ?? user?.username ?? '?')
    .split(' ')
    .map(part => part.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div style={appShell}>
      <aside style={sidebar}>
        <div style={brandBlock}>
          <div style={brandMark}>M</div>
          <div>
            <div style={brandName}>Metrored</div>
            <div style={brandSub}>Procesos</div>
          </div>
        </div>

        <button onClick={() => navigate('/requests/new')} style={primaryAction}>
          <span style={primaryActionIcon}>+</span>
          Crear solicitud
        </button>

        <nav style={navList}>
          {NAV.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              style={({ isActive }) => ({
                ...navItem,
                ...(isActive ? navItemActive : {}),
              })}
            >
              <span style={navIcon}>{item.icon}</span>
              <span style={navText}>
                <span style={navLabel}>{item.label}</span>
                <span style={navDescription}>{item.description}</span>
              </span>
            </NavLink>
          ))}
        </nav>

        <div style={helpCard}>
          <div style={helpEyebrow}>Procesos</div>
          <div style={helpTitle}>Disena procesos guiados</div>
          <div style={helpText}>
            Organiza formularios, responsables y recorridos de aprobacion.
          </div>
          <button onClick={() => navigate('/process-builder')} style={helpButton}>
            Disenar proceso
          </button>
        </div>

        <div style={userBlock}>
          <div style={avatar}>{initials}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={userName}>{user?.name ?? 'Usuario'}</div>
            <div style={userEmail}>{user?.username ?? ''}</div>
          </div>
          <button
            onClick={() => instance.logoutPopup().then(() => window.location.href = '/flowapp/')}
            style={logoutButton}
          >
            Salir
          </button>
        </div>
      </aside>

      <main style={mainArea}>
        <header style={topbar}>
          <div>
            <div style={topbarEyebrow}>Plataforma corporativa</div>
            <div style={topbarTitle}>Gestion de procesos internos</div>
          </div>

          <div style={topbarRight}>
            <button onClick={() => navigate('/process-builder')} style={ghostButton}>
              Disenar procesos
            </button>
            <button onClick={() => navigate('/mis-tareas')} style={solidButton}>
              Ver mis tareas
            </button>
          </div>
        </header>

        <section style={content}>
          {children}
        </section>
      </main>
    </div>
  );
}

const appShell: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  background: 'linear-gradient(135deg, #F6F9FC 0%, #EEF4FA 45%, #F7F7F4 100%)',
  color: '#101828',
};

const sidebar: React.CSSProperties = {
  position: 'sticky',
  top: 0,
  height: '100vh',
  width: 232,
  flexShrink: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  padding: 12,
  background: '#0C447C',
  boxSizing: 'border-box',
  overflow: 'hidden',
};

const brandBlock: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '8px 8px 12px',
};

const brandMark: React.CSSProperties = {
  width: 38,
  height: 38,
  borderRadius: 14,
  display: 'grid',
  placeItems: 'center',
  background: '#EAF2FA',
  color: '#0C447C',
  fontWeight: 900,
  fontSize: 18,
};

const brandName: React.CSSProperties = {
  color: '#FFFFFF',
  fontWeight: 900,
  fontSize: 15,
};

const brandSub: React.CSSProperties = {
  color: '#B5D4F4',
  fontWeight: 800,
  fontSize: 11,
  marginTop: 2,
};

const primaryAction: React.CSSProperties = {
  width: '100%',
  border: 'none',
  borderRadius: 14,
  padding: '10px 12px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 10,
  background: '#FFFFFF',
  color: '#0C447C',
  fontSize: 11,
  fontWeight: 900,
  cursor: 'pointer',
};

const primaryActionIcon: React.CSSProperties = {
  width: 24,
  height: 24,
  borderRadius: 9,
  display: 'grid',
  placeItems: 'center',
  background: '#1D9E75',
  color: '#FFFFFF',
  fontWeight: 900,
};

const navList: React.CSSProperties = {
  display: 'grid',
  gap: 6,
  overflowY: 'auto',
  paddingRight: 2,
};

const navItem: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '8px 9px',
  borderRadius: 14,
  textDecoration: 'none',
  color: '#D9ECFF',
  background: 'transparent',
};

const navItemActive: React.CSSProperties = {
  background: 'rgba(255,255,255,.14)',
  color: '#FFFFFF',
};

const navIcon: React.CSSProperties = {
  width: 29,
  height: 29,
  borderRadius: 12,
  display: 'grid',
  placeItems: 'center',
  background: 'rgba(255,255,255,.13)',
  color: '#FFFFFF',
  fontSize: 11,
  fontWeight: 900,
  flexShrink: 0,
};

const navText: React.CSSProperties = {
  minWidth: 0,
  display: 'grid',
  gap: 2,
};

const navLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 900,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const navDescription: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: '#B5D4F4',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const helpCard: React.CSSProperties = {
  marginTop: 'auto',
  padding: 12,
  borderRadius: 14,
  background: 'rgba(255,255,255,.12)',
  border: '1px solid rgba(255,255,255,.16)',
};

const helpEyebrow: React.CSSProperties = {
  color: '#A7F3D0',
  fontSize: 11,
  fontWeight: 900,
  textTransform: 'uppercase',
  letterSpacing: .6,
};

const helpTitle: React.CSSProperties = {
  color: '#FFFFFF',
  fontSize: 11,
  fontWeight: 900,
  marginTop: 6,
};

const helpText: React.CSSProperties = {
  color: 'rgba(255,255,255,.78)',
  fontSize: 11,
  lineHeight: 1.4,
  marginTop: 6,
};

const helpButton: React.CSSProperties = {
  marginTop: 12,
  width: '100%',
  background: '#FFFFFF',
  color: '#0C447C',
  border: 'none',
  borderRadius: 12,
  padding: '8px 9px',
  fontWeight: 900,
  cursor: 'pointer',
};

const userBlock: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: 10,
  borderRadius: 14,
  background: 'rgba(255,255,255,.12)',
  border: '1px solid rgba(255,255,255,.16)',
};

const avatar: React.CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: '50%',
  display: 'grid',
  placeItems: 'center',
  background: '#FFFFFF',
  color: '#0C447C',
  fontSize: 11,
  fontWeight: 900,
  flexShrink: 0,
};

const userName: React.CSSProperties = {
  color: '#FFFFFF',
  fontSize: 11,
  fontWeight: 900,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const userEmail: React.CSSProperties = {
  color: '#B5D4F4',
  fontSize: 11,
  fontWeight: 700,
  marginTop: 2,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const logoutButton: React.CSSProperties = {
  border: 'none',
  background: 'rgba(255,255,255,.14)',
  color: '#FFFFFF',
  borderRadius: 10,
  padding: '7px 9px',
  fontSize: 11,
  fontWeight: 900,
  cursor: 'pointer',
};

const mainArea: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  padding: 14,
  gap: 16,
  boxSizing: 'border-box',
};

const topbar: React.CSSProperties = {
  minHeight: 56,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 16,
  padding: '10px 14px',
  borderRadius: 18,
  background: 'rgba(255,255,255,.72)',
  border: '1px solid rgba(255,255,255,.82)',
  boxShadow: '0 14px 44px rgba(16,24,40,.07)',
};

const topbarEyebrow: React.CSSProperties = {
  color: '#185FA5',
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: .7,
  textTransform: 'uppercase',
};

const topbarTitle: React.CSSProperties = {
  color: '#111827',
  fontSize: 15,
  fontWeight: 900,
  marginTop: 2,
};

const topbarRight: React.CSSProperties = {
  display: 'flex',
  gap: 10,
  alignItems: 'center',
  flexWrap: 'wrap',
  justifyContent: 'flex-end',
};

const ghostButton: React.CSSProperties = {
  border: '1px solid #B5D4F4',
  background: '#FFFFFF',
  color: '#185FA5',
  borderRadius: 999,
  padding: '8px 12px',
  fontSize: 11,
  fontWeight: 900,
  cursor: 'pointer',
};

const solidButton: React.CSSProperties = {
  border: 'none',
  background: '#0C447C',
  color: '#FFFFFF',
  borderRadius: 999,
  padding: '8px 12px',
  fontSize: 11,
  fontWeight: 900,
  cursor: 'pointer',
};

const content: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflow: 'auto',
  borderRadius: 18,
  background: 'rgba(255,255,255,.46)',
  border: '1px solid rgba(255,255,255,.62)',
};
