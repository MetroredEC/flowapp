import { ReactNode, useEffect, useRef, useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useMsal } from '@azure/msal-react';
import { api, PersonaKey, Space } from '../../lib/api';
import { useIsMobile } from '../../lib/useIsMobile';
import { PERSONA_HOME, usePersona } from '../../lib/persona';

const T = { brand: '#0284C7', ink: '#0F172A', ink2: '#475569', ink3: '#94A3B8', line: '#E2E8F0' };

export default function Layout({ children }: { children: ReactNode }) {
  const { instance, accounts } = useMsal();
  const user = accounts[0];
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const initials = user?.name ? user.name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() : '?';
  const roles = ((user?.idTokenClaims as { roles?: string[] } | undefined)?.roles) ?? [];
  const isAdmin = roles.includes('flowapp-admin');

  const { profile } = usePersona();
  // Qué secciones ve cada quien. Un solicitante puro no necesita el tablero de
  // un área, y un ejecutor no necesita el panel de capacidad.
  //
  // Si el perfil todavía no llegó (o el backend aún no tiene la migración de
  // personas), se muestra la navegación completa: una detección que falla no
  // debe quitarle secciones a nadie.
  const known = Boolean(profile);
  const has = (persona: PersonaKey) => Boolean(profile?.personas.some(p => p.key === persona));
  const showWork = !known || has('ejecutor') || has('lider') || isAdmin;
  const showDecisions = known && has('aprobador');
  const showTeam = (known && has('lider')) || isAdmin;
  const showManagement = (known && has('gerencia')) || isAdmin;

  const [spaces, setSpaces] = useState<Space[]>([]);
  const [unread, setUnread] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const mainRef = useRef<HTMLElement | null>(null);

  useEffect(() => { api.getSpaces().then(r => setSpaces(r.data)).catch(() => {}); }, []);

  // Polling en vivo del contador de bandeja
  useEffect(() => {
    let active = true;
    const tick = () => api.getInboxCount().then(r => { if (active) setUnread(r.unread); }).catch(() => {});
    tick();
    const iv = setInterval(tick, 8000);
    return () => { active = false; clearInterval(iv); };
  }, []);

  // Cerrar el menú móvil al navegar
  useEffect(() => {
    setMenuOpen(false);
    mainRef.current?.scrollTo({ top: 0, left: 0 });
    window.scrollTo({ top: 0, left: 0 });
  }, [location.pathname]);

  const navContent = (
    <>
      {/* Nueva solicitud — todo trabajo entra por el flujo de aprobación */}
      <div style={{ padding: '2px 10px 8px' }}>
        <button onClick={() => navigate('/solicitudes/nueva')} style={{
          width: '100%', background: 'linear-gradient(135deg, #0284C7, #0891B2)', color: '#fff',
          border: 'none', borderRadius: 9, padding: '11px 0', fontSize: 13, fontWeight: 700,
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
          boxShadow: '0 4px 12px rgba(2,132,199,0.25)',
        }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Nueva solicitud
        </button>
      </div>

      <nav style={{ padding: '4px 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Item to="/mis-solicitudes" icon="◧" label="Mis solicitudes" />
        {showDecisions && <Item to="/decisiones" icon="⚖" label="Decisiones" badge={profile?.signals.pendingApprovals} />}
        {showWork && <Item to="/mi-dia" icon="◵" label="Mi día" />}
        <Item to="/bandeja" icon="✉" label="Bandeja" badge={unread} />
        {showWork && <Item to="/trabajo" icon="✓" label="Trabajo" />}
        {showTeam && <Item to="/equipo" icon="◔" label="Mi equipo" />}
      </nav>

      {showWork && (
        <>
          <div style={{ padding: '16px 18px 6px', fontSize: 10, fontWeight: 800, color: T.ink3, letterSpacing: 0.8 }}>ESPACIOS</div>
          <nav style={{ padding: '0 10px', display: 'flex', flexDirection: 'column', gap: 1, flex: 1, overflowY: 'auto' }}>
            {spaces.map(s => (
              <NavLink key={s.id} to={`/espacio/${s.id}`} style={({ isActive }) => ({
                display: 'flex', alignItems: 'center', gap: 10, padding: isMobile ? '11px 12px' : '8px 12px', borderRadius: 8,
                textDecoration: 'none', fontSize: isMobile ? 14 : 13, fontWeight: isActive ? 700 : 500,
                background: isActive ? 'rgba(2,132,199,0.1)' : 'transparent',
                color: isActive ? T.brand : T.ink2, transition: 'all .12s',
              })}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                {s.name}
              </NavLink>
            ))}
            {spaces.length === 0 && <div style={{ padding: '8px 12px', fontSize: 12, color: T.ink3 }}>Cargando…</div>}
          </nav>
        </>
      )}

      <div style={{ padding: '6px 10px', borderTop: `1px solid ${T.line}`, marginTop: showWork ? 0 : 'auto' }}>
        <Item to="/solicitudes" icon="▤" label="Solicitudes" />
        {showManagement && <Item to="/gerencia" icon="▦" label="Gerencia" />}
        {isAdmin && <Item to="/admin" icon="⚙" label="Administrar" />}
      </div>

      <PersonaSwitcher />

      <div style={{ padding: '10px 14px', borderTop: `1px solid ${T.line}`, display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg, #0284C7, #4F46E5)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{initials}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.name ?? ''}</div>
          <div style={{ fontSize: 10, color: T.ink3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.username ?? ''}</div>
        </div>
        <button onClick={() => instance.logoutRedirect()} title="Cerrar sesión" style={{ background: 'none', border: 'none', color: T.ink3, cursor: 'pointer', padding: 4, fontSize: 15 }}>⏻</button>
      </div>
    </>
  );

  // ─── Móvil: header fijo + menú deslizable ──────────────────────────────────
  if (isMobile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'linear-gradient(135deg, #F5F7FA 0%, #EEF2F7 100%)' }}>
        <header style={{
          position: 'sticky', top: 0, zIndex: 200, height: 56,
          background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(16px)',
          borderBottom: `1px solid ${T.line}`,
          display: 'flex', alignItems: 'center', gap: 12, padding: '0 14px',
        }}>
          <button onClick={() => setMenuOpen(true)} aria-label="Menú" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, display: 'flex' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={T.ink} strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <div onClick={() => navigate('/')} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <div style={{ width: 30, height: 30, background: 'linear-gradient(135deg, #0284C7, #0891B2)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 900, color: '#fff' }}>M</div>
            <span style={{ fontSize: 14, fontWeight: 800, color: T.brand, letterSpacing: -0.4 }}>Metrored</span>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
            <button onClick={() => navigate('/bandeja')} aria-label="Bandeja" style={{ position: 'relative', background: 'none', border: 'none', cursor: 'pointer', padding: 8, display: 'flex' }}>
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={T.ink2} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
              </svg>
              {unread > 0 && (
                <span style={{ position: 'absolute', top: 3, right: 2, background: '#DC2626', color: '#fff', fontSize: 9, fontWeight: 800, padding: '1px 5px', borderRadius: 8, minWidth: 16, textAlign: 'center' }}>{unread}</span>
              )}
            </button>
            <button onClick={() => navigate('/solicitudes/nueva')} aria-label="Nueva solicitud" style={{
              background: 'linear-gradient(135deg, #0284C7, #0891B2)', color: '#fff', border: 'none',
              borderRadius: 8, width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
          </div>
        </header>

        {menuOpen && (
          <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', zIndex: 300 }}>
            <aside onClick={e => e.stopPropagation()} style={{
              position: 'absolute', top: 0, left: 0, bottom: 0, width: 280, maxWidth: '84vw',
              background: '#fff', display: 'flex', flexDirection: 'column',
              boxShadow: '8px 0 32px rgba(0,0,0,0.18)', animation: 'slideIn .18s ease-out',
            }}>
              <style>{`@keyframes slideIn { from { transform: translateX(-100%); } to { transform: none; } }`}</style>
              <div style={{ padding: '16px 18px 10px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 32, height: 32, background: 'linear-gradient(135deg, #0284C7, #0891B2)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 900, color: '#fff' }}>M</div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: T.brand, lineHeight: 1 }}>Metrored</div>
                  <div style={{ fontSize: 9, fontWeight: 700, color: '#0891B2', letterSpacing: 0.4, marginTop: 2 }}>WORKSPACE</div>
                </div>
                <button onClick={() => setMenuOpen(false)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: T.ink3, fontSize: 18, cursor: 'pointer', padding: 4 }}>✕</button>
              </div>
              {navContent}
            </aside>
          </div>
        )}

        <main ref={mainRef} style={{ flex: 1, overflow: 'auto', minWidth: 0 }}>{children}</main>
      </div>
    );
  }

  // ─── Escritorio: sidebar fija ──────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'linear-gradient(135deg, #F5F7FA 0%, #EEF2F7 100%)' }}>
      <aside style={{
        width: 232, flexShrink: 0, position: 'sticky', top: 0, height: '100vh',
        background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(16px)',
        borderRight: `1px solid ${T.line}`, display: 'flex', flexDirection: 'column',
      }}>
        <div onClick={() => navigate('/')} style={{ padding: '18px 18px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, background: 'linear-gradient(135deg, #0284C7, #0891B2)', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 900, color: '#fff' }}>M</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: T.brand, letterSpacing: -0.4, lineHeight: 1 }}>Metrored</div>
            <div style={{ fontSize: 9, fontWeight: 700, color: '#0891B2', letterSpacing: 0.4, marginTop: 2 }}>WORKSPACE</div>
          </div>
        </div>
        {navContent}
      </aside>

      <main ref={mainRef} style={{ flex: 1, overflow: 'auto', minWidth: 0 }}>{children}</main>
    </div>
  );
}

function Item({ to, icon, label, badge }: { to: string; icon: string; label: string; badge?: number }) {
  return (
    <NavLink to={to} end={to === '/'} style={({ isActive }) => ({
      display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8,
      textDecoration: 'none', fontSize: 13, fontWeight: isActive ? 700 : 500,
      background: isActive ? 'rgba(2,132,199,0.1)' : 'transparent',
      color: isActive ? T.brand : T.ink2, transition: 'all .12s',
    })}>
      <span style={{ fontSize: 14, width: 16, textAlign: 'center' }}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
      {badge != null && badge > 0 && (
        <span style={{ background: T.brand, color: '#fff', fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 9, minWidth: 18, textAlign: 'center' }}>{badge}</span>
      )}
    </NavLink>
  );
}

/**
 * Conmutador de persona.
 *
 * Casi nadie es una sola persona: un líder también ejecuta y aprueba. FlowApp
 * elige el inicio más probable, pero la persona debe poder cambiarlo sin
 * pedirle permiso a nadie, y fijarlo si el automático no acierta.
 */
function PersonaSwitcher() {
  const { profile, active, view, pin } = usePersona();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!profile || profile.personas.length <= 1) return null;

  const current = profile.personas.find(p => p.key === active);

  const choose = (key: PersonaKey) => {
    view(key);
    setOpen(false);
    navigate(PERSONA_HOME[key]);
  };

  const togglePin = async () => {
    setSaving(true);
    try { await pin(profile.preferred === active ? null : active); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ padding: '8px 10px', borderTop: `1px solid ${T.line}`, position: 'relative' }}>
      {open && (
        <div style={{
          position: 'absolute', bottom: 'calc(100% - 4px)', left: 10, right: 10,
          background: '#fff', border: `1px solid ${T.line}`, borderRadius: 11,
          boxShadow: '0 14px 34px rgba(15,23,42,.18)', overflow: 'hidden', zIndex: 400,
        }}>
          <div style={{ padding: '10px 13px 6px', fontSize: 10, fontWeight: 800, color: T.ink3, letterSpacing: .6 }}>
            EMPEZAR MI DÍA COMO
          </div>
          {profile.personas.map(persona => (
            <button key={persona.key} onClick={() => choose(persona.key)} style={{
              display: 'block', width: '100%', textAlign: 'left', border: 'none',
              borderTop: `1px solid ${T.line}`, cursor: 'pointer', padding: '10px 13px',
              background: persona.key === active ? 'rgba(2,132,199,0.07)' : '#fff', fontFamily: 'inherit',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ fontSize: 12.5, fontWeight: 750, color: persona.key === active ? T.brand : T.ink }}>{persona.label}</span>
                {profile.preferred === persona.key && (
                  <span style={{ fontSize: 9, fontWeight: 800, color: T.brand, background: '#E6F1FB', padding: '1px 5px', borderRadius: 5 }}>FIJADA</span>
                )}
              </div>
              <div style={{ fontSize: 10.5, color: T.ink3, marginTop: 2 }}>{persona.reason}</div>
            </button>
          ))}
          <button onClick={togglePin} disabled={saving} style={{
            display: 'block', width: '100%', textAlign: 'left', border: 'none',
            borderTop: `1px solid ${T.line}`, background: '#F8FAFC', cursor: saving ? 'wait' : 'pointer',
            padding: '10px 13px', fontSize: 11.5, fontWeight: 700, color: T.ink2, fontFamily: 'inherit',
          }}>
            {profile.preferred === active
              ? 'Volver a la detección automática'
              : `Fijar ${current?.label ?? 'esta vista'} como mi inicio`}
          </button>
        </div>
      )}

      <button onClick={() => setOpen(v => !v)} style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
        background: 'rgba(2,132,199,0.06)', border: `1px solid ${T.line}`, borderRadius: 9,
        padding: '8px 11px', fontFamily: 'inherit', textAlign: 'left',
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 9.5, fontWeight: 800, color: T.ink3, letterSpacing: .5 }}>VIENDO COMO</div>
          <div style={{ fontSize: 12, fontWeight: 750, color: T.brand, marginTop: 1 }}>{current?.label ?? 'Solicitante'}</div>
        </div>
        <span style={{ fontSize: 10, color: T.ink3 }}>{open ? '▾' : '▴'}</span>
      </button>
    </div>
  );
}
