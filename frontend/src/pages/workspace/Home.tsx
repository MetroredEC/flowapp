// Punto de entrada de la sesión.
// No es una pantalla: decide cuál es la pantalla correcta para quien entra.

import { Navigate } from 'react-router-dom';
import { usePersona, PERSONA_HOME } from '../../lib/persona';
import { T } from './theme';

export default function Home() {
  const { profile, loading, active } = usePersona();

  if (loading) {
    return <div style={{ padding: 48, color: T.ink3, fontSize: 14 }}>Preparando tu espacio…</div>;
  }

  // Sin perfil (error de red o backend sin migrar) el ejecutor sigue siendo el
  // punto de entrada más seguro: Mi día funciona sin el modelo de personas.
  const home = profile ? PERSONA_HOME[active] : '/mi-dia';
  return <Navigate to={home} replace />;
}
