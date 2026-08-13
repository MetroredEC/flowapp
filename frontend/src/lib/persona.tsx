// Contexto de persona.
//
// FlowApp decide dónde empieza cada quien a partir del trabajo que realmente
// tiene delante. El perfil se pide una vez por sesión y se comparte con toda
// la aplicación para que la navegación y la pantalla de inicio coincidan.

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, PersonaKey, PersonaProfile } from './api';

interface PersonaContextValue {
  profile: PersonaProfile | null;
  loading: boolean;
  /** Persona con la que se está navegando ahora mismo. */
  active: PersonaKey;
  /** Cambia de persona solo para esta sesión, sin guardar preferencia. */
  view: (persona: PersonaKey) => void;
  /** Fija la persona de inicio (o la suelta con null para volver a automático). */
  pin: (persona: PersonaKey | null) => Promise<void>;
  reload: () => Promise<void>;
}

const PersonaContext = createContext<PersonaContextValue | null>(null);

export function PersonaProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<PersonaProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [override, setOverride] = useState<PersonaKey | null>(null);

  const reload = useCallback(async () => {
    try {
      const result = await api.getMe();
      setProfile(result.data);
    } catch {
      // Sin perfil la aplicación sigue siendo usable: todos pueden solicitar.
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const pin = useCallback(async (persona: PersonaKey | null) => {
    const result = await api.setPersona(persona);
    setProfile(result.data);
    setOverride(null);
  }, []);

  const value = useMemo<PersonaContextValue>(() => ({
    profile,
    loading,
    active: override ?? profile?.primary ?? 'solicitante',
    view: setOverride,
    pin,
    reload,
  }), [profile, loading, override, pin, reload]);

  return <PersonaContext.Provider value={value}>{children}</PersonaContext.Provider>;
}

export function usePersona(): PersonaContextValue {
  const context = useContext(PersonaContext);
  if (!context) throw new Error('usePersona debe usarse dentro de PersonaProvider');
  return context;
}

/** Rutas de inicio por persona. Debe coincidir con backend/src/utils/personas.ts. */
export const PERSONA_HOME: Record<PersonaKey, string> = {
  gerencia:    '/gerencia',
  lider:       '/equipo',
  aprobador:   '/decisiones',
  ejecutor:    '/mi-dia',
  admin:       '/admin',
  solicitante: '/mis-solicitudes',
};

export const PERSONA_LABEL: Record<PersonaKey, string> = {
  gerencia:    'Gerencia',
  lider:       'Líder de área',
  aprobador:   'Aprobador',
  ejecutor:    'Ejecutor',
  admin:       'Administrador',
  solicitante: 'Solicitante',
};
