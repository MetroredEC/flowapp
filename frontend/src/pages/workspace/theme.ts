// Tema compartido del workspace — light + glass, azul Metrored
export const T = {
  brand:   '#0284C7',
  brandDk: '#0670BE',
  ink:     '#0F172A',
  ink2:    '#475569',
  ink3:    '#94A3B8',
  line:    '#E2E8F0',
  bg:      '#F5F7FA',
  glass:   'rgba(255,255,255,0.7)',
  card:    '#FFFFFF',
};

export const PRIORITY: Record<string, { label: string; bg: string; color: string }> = {
  urgent: { label: 'Urgente', bg: '#FEE2E2', color: '#A32D2D' },
  high:   { label: 'Alta',    bg: '#FEF3C7', color: '#854F0B' },
  normal: { label: 'Normal',  bg: '#E6F1FB', color: '#185FA5' },
  low:    { label: 'Baja',    bg: '#F1F5F9', color: '#64748B' },
};

export function initials(name?: string | null): string {
  if (!name) return '?';
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

export function timeAgo(iso: string): string {
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return 'ahora';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 604800) return `${Math.floor(s / 86400)}d`;
  return d.toLocaleDateString('es-EC', { day: 'numeric', month: 'short' });
}

export function glassCard(extra?: React.CSSProperties): React.CSSProperties {
  return {
    background: T.glass,
    backdropFilter: 'blur(12px)',
    border: `1px solid ${T.line}`,
    borderRadius: 14,
    boxShadow: '0 4px 16px rgba(0,0,0,0.04)',
    ...extra,
  };
}
