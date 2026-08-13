/**
 * Diálogos de la plataforma — reemplazan confirm()/alert() del navegador.
 * Uso:  const ok = await confirmDialog({ title, message, danger });
 *       await alertDialog({ title, message, tone });
 * Requiere <AppDialogHost /> montado una vez en App.
 */
import { useEffect, useState } from 'react';

const T = { brand: '#0284C7', ink: '#0F172A', ink2: '#475569', ink3: '#94A3B8', line: '#E2E8F0' };

type Tone = 'info' | 'success' | 'danger' | 'warning';

interface DialogReq {
  kind: 'confirm' | 'alert';
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  tone?: Tone;
  resolve: (v: boolean) => void;
}

let push: ((r: DialogReq) => void) | null = null;

export function confirmDialog(opts: {
  title: string; message?: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean;
}): Promise<boolean> {
  return new Promise(resolve => {
    if (!push) { resolve(window.confirm(opts.title)); return; }  // fallback si el host no está montado
    push({ kind: 'confirm', resolve, ...opts });
  });
}

export function alertDialog(opts: { title: string; message?: string; tone?: Tone }): Promise<void> {
  return new Promise(resolve => {
    if (!push) { window.alert(opts.title); resolve(); return; }
    push({ kind: 'alert', resolve: () => resolve(), ...opts });
  });
}

const TONE_META: Record<Tone, { icon: string; bg: string; color: string }> = {
  info:    { icon: 'i', bg: '#E6F1FB', color: '#185FA5' },
  success: { icon: '✓', bg: '#E1F5EE', color: '#0F6E56' },
  danger:  { icon: '!', bg: '#FCEBEB', color: '#A32D2D' },
  warning: { icon: '!', bg: '#FAEEDA', color: '#854F0B' },
};

export default function AppDialogHost() {
  const [queue, setQueue] = useState<DialogReq[]>([]);
  const current = queue[0] ?? null;

  useEffect(() => {
    push = (r: DialogReq) => setQueue(q => [...q, r]);
    return () => { push = null; };
  }, []);

  useEffect(() => {
    if (!current) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(false);
      if (e.key === 'Enter') close(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  function close(result: boolean) {
    if (!current) return;
    current.resolve(result);
    setQueue(q => q.slice(1));
  }

  if (!current) return null;

  const tone: Tone = current.tone ?? (current.danger ? 'danger' : 'info');
  const tm = TONE_META[tone];

  return (
    <div onClick={() => close(false)} style={{
      position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(3px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 400, maxWidth: '92vw', background: '#fff', borderRadius: 16,
        boxShadow: '0 24px 64px rgba(0,0,0,0.28)', overflow: 'hidden',
        animation: 'dlgIn .16s ease-out',
      }}>
        <style>{`@keyframes dlgIn { from { opacity: 0; transform: scale(0.96) translateY(6px); } to { opacity: 1; transform: none; } }`}</style>
        <div style={{ padding: '22px 24px 18px', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <div style={{
            width: 38, height: 38, borderRadius: 11, background: tm.bg, color: tm.color,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 17, fontWeight: 900, flexShrink: 0,
          }}>{tm.icon}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: T.ink, lineHeight: 1.35 }}>{current.title}</div>
            {current.message && (
              <div style={{ fontSize: 13, color: T.ink2, marginTop: 6, lineHeight: 1.55, whiteSpace: 'pre-line' }}>
                {current.message}
              </div>
            )}
          </div>
        </div>
        <div style={{ padding: '0 24px 20px', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          {current.kind === 'confirm' && (
            <button onClick={() => close(false)} style={{
              background: '#fff', border: `1px solid ${T.line}`, borderRadius: 9,
              padding: '9px 18px', fontSize: 13, fontWeight: 600, color: T.ink2, cursor: 'pointer',
            }}>
              {current.cancelLabel ?? 'Cancelar'}
            </button>
          )}
          <button autoFocus onClick={() => close(true)} style={{
            background: tone === 'danger' ? '#DC2626' : T.brand,
            color: '#fff', border: 'none', borderRadius: 9,
            padding: '9px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}>
            {current.kind === 'confirm' ? (current.confirmLabel ?? 'Confirmar') : 'Entendido'}
          </button>
        </div>
      </div>
    </div>
  );
}
