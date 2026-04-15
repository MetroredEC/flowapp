import { ReactNode, CSSProperties } from 'react';

// ─── Card ─────────────────────────────────────────────────────────────────────
export function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{
      background: '#fff', borderRadius: 12, padding: 24,
      border: '1px solid #E8E8E4', ...style,
    }}>
      {children}
    </div>
  );
}

// ─── Page header ──────────────────────────────────────────────────────────────
export function PageHeader({ title, subtitle, action }: {
  title: string; subtitle?: string; action?: ReactNode;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
      marginBottom: 24 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#111', letterSpacing: -0.3 }}>{title}</h1>
        {subtitle && <p style={{ color: '#888', fontSize: 13, marginTop: 4 }}>{subtitle}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────
const STATUS_MAP: Record<string, { label: string; bg: string; color: string }> = {
  pending:     { label: 'Pendiente',   bg: '#FAEEDA', color: '#633806' },
  in_progress: { label: 'En proceso',  bg: '#E6F1FB', color: '#0C447C' },
  approved:    { label: 'Aprobada',    bg: '#E1F5EE', color: '#085041' },
  rejected:    { label: 'Rechazada',   bg: '#FAECE7', color: '#712B13' },
  cancelled:   { label: 'Cancelada',   bg: '#F1EFE8', color: '#5F5E5A' },
  draft:       { label: 'Borrador',    bg: '#F1EFE8', color: '#5F5E5A' },
};
export function StatusBadge({ status }: { status: string }) {
  const s = STATUS_MAP[status] ?? { label: status, bg: '#F1EFE8', color: '#444' };
  return (
    <span style={{
      background: s.bg, color: s.color, fontSize: 11, fontWeight: 700,
      padding: '3px 10px', borderRadius: 20, letterSpacing: 0.3,
    }}>{s.label}</span>
  );
}

// ─── Step badge ───────────────────────────────────────────────────────────────
const STEP_MAP: Record<string, { bg: string; color: string }> = {
  pending:  { bg: '#F1EFE8', color: '#5F5E5A' },
  approved: { bg: '#E1F5EE', color: '#085041' },
  rejected: { bg: '#FAECE7', color: '#712B13' },
  skipped:  { bg: '#F1EFE8', color: '#888' },
};
export function StepBadge({ status }: { status: string }) {
  const s = STEP_MAP[status] ?? STEP_MAP.pending;
  const labels: Record<string, string> = {
    pending: 'Pendiente', approved: 'Aprobado', rejected: 'Rechazado', skipped: 'Omitido'
  };
  return (
    <span style={{
      background: s.bg, color: s.color, fontSize: 11, fontWeight: 700,
      padding: '2px 8px', borderRadius: 12,
    }}>{labels[status] ?? status}</span>
  );
}

// ─── Button ───────────────────────────────────────────────────────────────────
type BtnVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
const BTN: Record<BtnVariant, CSSProperties> = {
  primary:   { background: '#0C447C', color: '#fff', border: 'none' },
  secondary: { background: '#fff', color: '#0C447C', border: '1.5px solid #B5D4F4' },
  danger:    { background: '#993C1D', color: '#fff', border: 'none' },
  ghost:     { background: 'transparent', color: '#0C447C', border: 'none' },
};
export function Btn({
  children, onClick, variant = 'primary', disabled, type = 'button', style,
}: {
  children: ReactNode; onClick?: () => void; variant?: BtnVariant;
  disabled?: boolean; type?: 'button' | 'submit'; style?: CSSProperties;
}) {
  return (
    <button
      type={type} onClick={onClick} disabled={disabled}
      style={{
        ...BTN[variant], borderRadius: 8, padding: '10px 20px',
        fontSize: 14, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1, transition: 'opacity .15s', ...style,
      }}
    >{children}</button>
  );
}

// ─── Input ────────────────────────────────────────────────────────────────────
export function Field({
  label, children, hint,
}: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 600,
        color: '#333', marginBottom: 6 }}>{label}</label>
      {children}
      {hint && <p style={{ fontSize: 12, color: '#999', marginTop: 4 }}>{hint}</p>}
    </div>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input {...props} style={{
      width: '100%', padding: '10px 12px', border: '1.5px solid #ddd',
      borderRadius: 8, fontSize: 14, outline: 'none', fontFamily: 'inherit',
      transition: 'border-color .15s', ...props.style,
    }}
    onFocus={e => e.target.style.borderColor = '#185FA5'}
    onBlur={e => e.target.style.borderColor = '#ddd'}
    />
  );
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea {...props} style={{
      width: '100%', padding: '10px 12px', border: '1.5px solid #ddd',
      borderRadius: 8, fontSize: 14, outline: 'none', fontFamily: 'inherit',
      resize: 'vertical', minHeight: 100, transition: 'border-color .15s', ...props.style,
    }}
    onFocus={e => e.target.style.borderColor = '#185FA5'}
    onBlur={e => e.target.style.borderColor = '#ddd'}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} style={{
      width: '100%', padding: '10px 12px', border: '1.5px solid #ddd',
      borderRadius: 8, fontSize: 14, outline: 'none', fontFamily: 'inherit',
      background: '#fff', cursor: 'pointer', ...props.style,
    }} />
  );
}

// ─── Spinner ──────────────────────────────────────────────────────────────────
export function Spinner({ size = 24 }: { size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      border: `2px solid #E8E8E4`, borderTopColor: '#185FA5',
      animation: 'spin .7s linear infinite',
    }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────
export function Empty({ message }: { message: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 24px', color: '#aaa' }}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>○</div>
      <p style={{ fontSize: 14 }}>{message}</p>
    </div>
  );
}

// ─── Nivel stepper visual ─────────────────────────────────────────────────────
export function LevelStepper({ current, total, steps }: {
  current: number; total: number;
  steps?: { level: number; approver_name: string; status: string }[];
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
      {Array.from({ length: total }, (_, i) => {
        const n = i + 1;
        const step = steps?.find(s => s.level === n);
        const isDone    = n < current || step?.status === 'approved';
        const isCurrent = n === current && step?.status === 'pending';
        const isRejected= step?.status === 'rejected';
        const bg = isRejected ? '#F0997B' : isDone ? '#1D9E75' : isCurrent ? '#185FA5' : '#D3D1C7';
        const color = isDone || isCurrent || isRejected ? '#fff' : '#888';
        return (
          <div key={n} style={{ display: 'flex', alignItems: 'center' }}>
            <div title={step?.approver_name ?? `Nivel ${n}`} style={{
              width: 32, height: 32, borderRadius: '50%', background: bg, color,
              fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center',
              justifyContent: 'center', cursor: 'default',
            }}>{isRejected ? '✕' : isDone ? '✓' : n}</div>
            {n < total && <div style={{ width: 24, height: 2, background: isDone ? '#1D9E75' : '#E8E8E4' }} />}
          </div>
        );
      })}
    </div>
  );
}
