import { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useMsal } from '@azure/msal-react';

const NAV = [
  { to: '/', label: 'Inicio', icon: '01', description: 'Resumen general' },
  { to: '/requests', label: 'Solicitudes', icon: '02', description: 'Procesos activos' },
  { to: '/requests/new', label: 'Nueva solicitud', icon: '03', description: 'Crear proceso' },
  { to: '/mis-tareas', label: 'Mis tareas', icon: '04', description: 'Aprobaciones' },
  { to: '/inventario', label: 'Inventario', icon: '05', description: 'Stock y Kardex' },
  { to: '/process-builder', label: 'Constructor', icon: '06', description: 'No-code BPM' },
  { to: '/admin', label: 'Administrar', icon: '07', description: 'Configuración' },
];

export default function Layout({ children }: { children: ReactNode }) {
  const { instance, accounts } = useMsal();
  const user = accounts[0];
  const navigate = useNavigate();

  const initials = (user?.name ?? user?.username ?? '?')
    .split(' ')
    .map(part => part.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div style={appShell}>
      <div style={backgroundGlowOne} />
      <div style={backgroundGlowTwo} />

      <aside style={sidebar}>
        <div style={brandBlock}>
          <div style={brandMark}>M</div>
          <div>
            <div style={brandName}>Metrored</div>
            <div style={brandSub}>FlowApp</div>
          </div>
        </div>

        <button
          onClick={() => navigate('/requests/new')}
          style={primaryAction}
        >
          <span style={primaryActionIcon}>+</span>
          Nueva solicitud
        </button>

        <nav style={navList}>
          {NAV.map(({ to, label, icon, description }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              style={({ isActive }) => ({
                ...navItem,
                ...(isActive ? navItemActive : {}),
              })}
            >
              <span style={navIcon}>{icon}</span>
              <span style={{ minWidth: 0 }}>
                <span style={navLabel}>{label}</span>
                <span style={navDescription}>{description}</span>
              </span>
            </NavLink>
          ))}
        </nav>

        <div style={helpCard}>
          <div style={helpEyebrow}>No-code</div>
          <div style={helpTitle}>Crea flujos sin programar</div>
          <div style={helpText}>
            Usa el constructor para convertir procesos reales en flujos aprobables.
          </div>
          <button
            onClick={() => navigate('/process-builder')}
            style={helpButton}
          >
            Abrir constructor
          </button>
        </div>

        <div style={userBlock}>
          <div style={avatar}>{initials}</div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={userName}>{user?.name ?? 'Usuario'}</div>
            <div style={userEmail}>{user?.username ?? ''}</div>
          </div>

          <button
            onClick={() => instance.logoutRedirect()}
            title="Cerrar sesión"
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
            <div style={topbarTitle}>Procesos, aprobaciones e inventario</div>
          </div>

          <div style={topbarRight}>
            <button
              onClick={() => navigate('/process-builder')}
              style={ghostButton}
            >
              Constructor no-code
            </button>

            <button
              onClick={() => navigate('/mis-tareas')}
              style={solidButton}
            >
              Ver mis tareas
            </button>
          </div>
        </header>

        <section style={contentGlass}>
          {children}
        </section>
      </main>
    </div>
  );
}

const appShell: React.CSSProperties = {
  position: 'relative',
  minHeight: '100vh',
  display: 'flex',
  background:
    'radial-gradient(circle at top left, rgba(24,95,165,.18), transparent 32%), linear-gradient(135deg, #F6F9FC 0%, #EEF4FA 42%, #F4F1EA 100%)',
  color: '#101828',
  overflow: 'hidden',
};

const backgroundGlowOne: React.CSSProperties = {
  position: 'fixed',
  width: 520,
  height: 520,
  borderRadius: '50%',
  background: 'rgba(24, 95, 165, .16)',
  filter: 'blur(60px)',
  top: -180,
  right: -140,
  pointerEvents: 'none',
};

const backgroundGlowTwo: React.CSSProperties = {
  position: 'fixed',
  width: 440,
  height: 440,
  borderRadius: '50%',
  background: 'rgba(29, 158, 117, .12)',
  filter: 'blur(60px)',
  bottom: -160,
  left: 120,
  pointerEvents: 'none',
};

const sidebar: React.CSSProperties = {
  position: 'sticky',
  top: 0,
  height: '100vh',
  width: 292,
  flexShrink: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 18,
  padding: 18,
  background: 'rgba(12, 68, 124, .78)',
  borderRight: '1px solid rgba(255,255,255,.20)',
  boxShadow: '24px 0 80px rgba(12,68,124,.16)',
  backdropFilter: 'blur(22px)',
  WebkitBackdropFilter: 'blur(22px)',
  zIndex: 2,
};

const brandBlock: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '12px 10px 8px',
};

const brandMark: React.CSSProperties = {
  width: 48,
  height: 48,
  borderRadius: 16,
  display: 'grid',
  placeItems: 'center',
  background: 'linear-gradient(145deg, #FFFFFF 0%, #DCEEFF 100%)',
  color: '#0C447C',
  fontWeight: 950,
  fontSize: 23,
  boxShadow: '0 16px 36px rgba(0,0,0,.18)',
};

const brandName: React.CSSProperties = {
  color: '#FFFFFF',
  fontWeight: 950,
  fontSize: 18,
  letterSpacing: -0.3,
};

const brandSub: React.CSSProperties = {
  color: '#B5D4F4',
  fontWeight: 800,
  fontSize: 12,
  marginTop: 2,
};

const primaryAction: React.CSSProperties = {
  width: '100%',
  border: '1px solid rgba(255,255,255,.28)',
  borderRadius: 18,
  padding: '13px 14px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 10,
  background: 'rgba(255,255,255,.94)',
  color: '#0C447C',
  fontSize: 14,
  fontWeight: 950,
  cursor: 'pointer',
  boxShadow: '0 18px 38px rgba(0,0,0,.18)',
};

const primaryActionIcon: React.CSSProperties = {
  width: 24,
  height: 24,
  borderRadius: 9,
  display: 'grid',
  placeItems: 'center',
  background: '#1D9E75',
  color: '#FFFFFF',
  fontWeight: 950,
};

const navList: React.CSSProperties = {
  display: 'grid',
  gap: 7,
  overflowY: 'auto',
  paddingRight: 2,
};

const navItem: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '11px 12px',
  borderRadius: 16,
  textDecoration: 'none',
  color: '#D9ECFF',
  background: 'transparent',
  border: '1px solid transparent',
  transition: 'all .16s ease',
};

const navItemActive: React.CSSProperties = {
  background: 'rgba(255,255,255,.16)',
  border: '1px solid rgba(255,255,255,.22)',
  color: '#FFFFFF',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,.15), 0 14px 30px rgba(0,0,0,.12)',
};

const navIcon: React.CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 13,
  display: 'grid',
  placeItems: 'center',
  background: 'rgba(255,255,255,.13)',
  color: '#FFFFFF',
  fontSize: 11,
  fontWeight: 950,
  flexShrink: 0,
};

const navLabel: React.CSSProperties = {
  display: 'block',
  fontSize: 14,
  fontWeight: 900,
  lineHeight: 1.1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const navDescription: React.CSSProperties = {
  display: 'block',
  marginTop: 3,
  fontSize: 11,
  fontWeight: 700,
  color: 'rgba(217,236,255,.72)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const helpCard: React.CSSProperties = {
  marginTop: 'auto',
  padding: 16,
  borderRadius: 20,
  background: 'rgba(255,255,255,.12)',
  border: '1px solid rgba(255,255,255,.18)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,.12)',
};

const helpEyebrow: React.CSSProperties = {
  color: '#A7F3D0',
  fontSize: 11,
  fontWeight: 950,
  textTransform: 'uppercase',
  letterSpacing: .6,
};

const helpTitle: React.CSSProperties = {
  color: '#FFFFFF',
  fontSize: 14,
  fontWeight: 950,
  marginTop: 6,
};

const helpText: React.CSSProperties = {
  color: 'rgba(255,255,255,.74)',
  fontSize: 12,
  lineHeight: 1.45,
  marginTop: 6,
};

const helpButton: React.CSSProperties = {
  marginTop: 12,
  width: '100%',
  background: 'rgba(255,255,255,.92)',
  color: '#0C447C',
  border: 'none',
  borderRadius: 12,
  padding: '9px 10px',
  fontWeight: 900,
  cursor: 'pointer',
};

const userBlock: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: 12,
  borderRadius: 18,
  background: 'rgba(255,255,255,.12)',
  border: '1px solid rgba(255,255,255,.18)',
};

const avatar: React.CSSProperties = {
  width: 38,
  height: 38,
  borderRadius: '50%',
  display: 'grid',
  placeItems: 'center',
  background: '#FFFFFF',
  color: '#0C447C',
  fontSize: 13,
  fontWeight: 950,
  flexShrink: 0,
};

const userName: React.CSSProperties = {
  color: '#FFFFFF',
  fontSize: 12,
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
  position: 'relative',
  zIndex: 1,
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  padding: 22,
  gap: 18,
};

const topbar: React.CSSProperties = {
  minHeight: 74,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 18,
  padding: '14px 18px',
  borderRadius: 24,
  background: 'rgba(255,255,255,.62)',
  border: '1px solid rgba(255,255,255,.72)',
  boxShadow: '0 18px 60px rgba(12,68,124,.10)',
  backdropFilter: 'blur(18px)',
  WebkitBackdropFilter: 'blur(18px)',
};

const topbarEyebrow: React.CSSProperties = {
  color: '#185FA5',
  fontSize: 11,
  fontWeight: 950,
  letterSpacing: .7,
  textTransform: 'uppercase',
};

const topbarTitle: React.CSSProperties = {
  color: '#111827',
  fontSize: 18,
  fontWeight: 950,
  marginTop: 2,
  letterSpacing: -0.3,
};

const topbarRight: React.CSSProperties = {
  display: 'flex',
  gap: 10,
  alignItems: 'center',
  flexWrap: 'wrap',
  justifyContent: 'flex-end',
};

const ghostButton: React.CSSProperties = {
  border: '1px solid rgba(24,95,165,.25)',
  background: 'rgba(255,255,255,.58)',
  color: '#185FA5',
  borderRadius: 999,
  padding: '10px 14px',
  fontSize: 13,
  fontWeight: 900,
  cursor: 'pointer',
};

const solidButton: React.CSSProperties = {
  border: 'none',
  background: '#0C447C',
  color: '#FFFFFF',
  borderRadius: 999,
  padding: '10px 15px',
  fontSize: 13,
  fontWeight: 900,
  cursor: 'pointer',
  boxShadow: '0 12px 30px rgba(12,68,124,.22)',
};

const contentGlass: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflow: 'auto',
  borderRadius: 26,
  background: 'rgba(255,255,255,.46)',
  border: '1px solid rgba(255,255,255,.62)',
  boxShadow: '0 28px 90px rgba(12,68,124,.10)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
};
