// Lenguaje visual del flujo de solicitud.
//
// Se apoya en los tokens del workspace (T) para no abrir un segundo sistema de
// diseño, y añade lo que este recorrido necesita: superficies grandes, foco
// evidente y movimiento con dirección.

import { T } from '../workspace/theme';

export const F = {
  ...T,
  accent:   '#14B8A6',
  ok:       '#0F9F6E',
  okBg:     '#DCFCE7',
  warn:     '#B45309',
  warnBg:   '#FEF3C7',
  danger:   '#C2413B',
  dangerBg: '#FEE2E2',
  surface:  '#FFFFFF',
  sunken:   '#F8FAFC',
  ring:     'rgba(2,132,199,.16)',
};

/** Paleta por área, para que cada categoría tenga identidad propia. */
export const AREA_COLORS: Record<string, string> = {
  marketing:   '#DB2777',
  bi:          '#7C3AED',
  comercial:   '#0284C7',
  operaciones: '#0F9F6E',
  sso:         '#D97706',
  rrhh:        '#0891B2',
  compras:     '#4F46E5',
};

export const areaColor = (key: string): string =>
  AREA_COLORS[key.toLowerCase()] ?? '#64748B';

/** Siglas que no deben capitalizarse como palabra normal ("bi" -> "BI"). */
const ACRONYMS: Record<string, string> = { bi: 'BI', sso: 'SSO', rrhh: 'RRHH', ti: 'TI' };

/** Nombre presentable de un área; el wizard guarda las categorías en minúscula. */
export function areaLabel(value: string): string {
  const key = value.trim().toLowerCase();
  if (ACRONYMS[key]) return ACRONYMS[key];
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Trazos de los iconos de proceso, alineados con los del wizard. */
export const ICON_PATHS: Record<string, string> = {
  flow:  'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
  doc:   'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z',
  brush: 'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L3 14.67V21h6.33l10.06-10.06a5.5 5.5 0 0 0 0-7.78v-.55z',
  chart: 'M18 20V10M12 20V4M6 20v-6',
  users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  shop:  'M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0',
};

/**
 * Movimiento del recorrido.
 *
 * Las transiciones tienen dirección: avanzar entra desde la derecha y retroceder
 * desde la izquierda, para que el gesto confirme hacia dónde se movió la
 * persona. Todo queda anulado bajo prefers-reduced-motion; el recorrido es
 * idéntico, solo deja de desplazarse.
 */
export const FLOW_CSS = `
@keyframes fwdIn  { from { opacity:0; transform: translateX(26px); } to { opacity:1; transform:none; } }
@keyframes backIn { from { opacity:0; transform: translateX(-26px); } to { opacity:1; transform:none; } }
@keyframes riseIn { from { opacity:0; transform: translateY(12px); } to { opacity:1; transform:none; } }
@keyframes popIn  { from { opacity:0; transform: scale(.96); } to { opacity:1; transform:none; } }
@keyframes glow   { 0%,100% { box-shadow:0 0 0 0 rgba(20,184,166,.0); } 50% { box-shadow:0 0 0 8px rgba(20,184,166,.14); } }
@keyframes checkIn{ from { opacity:0; transform: scale(.6) rotate(-12deg); } to { opacity:1; transform:none; } }
@keyframes floatUp{ from { opacity:0; transform: translateY(8px) scale(.9); } 60% { opacity:1; } to { opacity:0; transform: translateY(-26px) scale(1); } }

.fw-fwd   { animation: fwdIn .34s cubic-bezier(.22,.8,.3,1) both; }
.fw-back  { animation: backIn .34s cubic-bezier(.22,.8,.3,1) both; }
.fw-rise  { animation: riseIn .3s cubic-bezier(.22,.8,.3,1) both; }
.fw-pop   { animation: popIn .26s cubic-bezier(.22,.8,.3,1) both; }
.fw-check { animation: checkIn .3s cubic-bezier(.34,1.56,.64,1) both; }
.fw-toast { animation: floatUp 2.2s ease forwards; }

.fw-card { transition: transform .16s ease, box-shadow .18s ease, border-color .16s ease, background .16s ease; }
.fw-card:hover { transform: translateY(-3px); box-shadow: 0 14px 30px rgba(15,23,42,.12); }
.fw-card:active { transform: translateY(-1px); }

.fw-opt { transition: border-color .14s ease, background .14s ease, transform .12s ease; }
.fw-opt:hover { transform: translateX(2px); }

.fw-input { transition: border-color .15s ease, box-shadow .15s ease; }
.fw-input:focus { border-color: ${F.brand}; box-shadow: 0 0 0 4px ${F.ring}; }

.fw-bar { transition: width .5s cubic-bezier(.22,.8,.3,1); }
.fw-dot { transition: background .3s ease, transform .3s ease; }

@media (prefers-reduced-motion: reduce) {
  .fw-fwd, .fw-back, .fw-rise, .fw-pop, .fw-check, .fw-toast { animation: none !important; }
  .fw-card:hover, .fw-opt:hover { transform: none; }
  .fw-bar, .fw-dot { transition: none; }
}
`;

export const inputStyle: React.CSSProperties = {
  width: '100%', border: `1.5px solid ${F.line}`, borderRadius: 12,
  padding: '14px 16px', fontSize: 15.5, font: 'inherit',
  background: F.surface, color: F.ink, boxSizing: 'border-box', outline: 'none',
};
