/**
 * SSO · CRM — Pipeline de ventas, empresas, actividades y reportes.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useMsal } from '@azure/msal-react';
import { api, SSOSale, SSOActivity } from '../lib/api';
import { T, timeAgo, initials } from './workspace/theme';
import { confirmDialog } from '../components/AppDialog';

const STAGES = [
  { key: 'prospecto',       label: 'Prospecto',   color: '#64748B' },
  { key: 'negociacion',     label: 'Negociación', color: '#378ADD' },
  { key: 'propuesta',       label: 'Propuesta',   color: '#BA7517' },
  { key: 'cerrado_ganado',  label: 'Ganado',      color: '#1D9E75' },
  { key: 'cerrado_perdido', label: 'Perdido',     color: '#A32D2D' },
] as const;

const STAGE_PROB: Record<string, number> = {
  prospecto: 20, negociacion: 40, propuesta: 70, cerrado_ganado: 100, cerrado_perdido: 0,
};

const ORIGENES = ['Referido', 'Feria', 'Web', 'Llamada en frío', 'Convenio existente', 'Otro'];
const SERVICIOS = ['Medicina prepagada', 'Chequeos ejecutivos', 'Salud ocupacional', 'Convenio empresarial', 'Otro'];

const ACT_TYPES = [
  { key: 'nota',     label: 'Nota',     icon: '✎' },
  { key: 'llamada',  label: 'Llamada',  icon: '✆' },
  { key: 'reunion',  label: 'Reunión',  icon: '⚑' },
  { key: 'correo',   label: 'Correo',   icon: '✉' },
  { key: 'whatsapp', label: 'WhatsApp', icon: '✳' },
];

const money = (n: number) => '$' + (n ?? 0).toLocaleString('es-EC', { maximumFractionDigits: 0 });
const today = () => new Date().toISOString().slice(0, 10);

export default function SSOSales() {
  const [tab, setTab] = useState<'pipeline' | 'empresas' | 'reportes'>('pipeline');
  const [sales, setSales] = useState<SSOSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try { const r = await api.getSSOSales({ search: search || undefined }); setSales(r.data); }
    finally { setLoading(false); }
  }, [search]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const iv = setInterval(() => void load(true), 10000);
    return () => clearInterval(iv);
  }, [load]);

  async function moveStage(sale: SSOSale, estado: string) {
    if (sale.estado === estado) return;
    if (estado === 'cerrado_ganado') {
      const ok = await confirmDialog({
        title: `¿Marcar "${sale.empresa}" como ganada?`,
        message: 'Se creará automáticamente una tarea en Operaciones para implementar el servicio.',
        confirmLabel: 'Sí, ganada',
      });
      if (!ok) return;
    }
    setSales(ss => ss.map(s => s.id === sale.id ? { ...s, estado: estado as SSOSale['estado'], probabilidad: STAGE_PROB[estado] } : s));
    await api.updateSSOSale(sale.id, { estado: estado as SSOSale['estado'], probabilidad: STAGE_PROB[estado] });
    void load(true);
  }

  const open = sales.find(s => s.id === openId) ?? null;

  return (
    <div style={{ padding: 32, maxWidth: tab === 'pipeline' ? 1280 : 1000, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6, flexWrap: 'wrap' }}>
        <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#BA7517' }} />
        <h1 style={{ fontSize: 22, fontWeight: 800, color: T.ink, letterSpacing: -0.4 }}>SSO · CRM</h1>
        <div style={{ display: 'flex', gap: 2, background: '#F1F5F9', padding: 3, borderRadius: 8, marginLeft: 8 }}>
          {([['pipeline', 'Pipeline'], ['empresas', 'Empresas'], ['reportes', 'Reportes']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} style={{
              border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              background: tab === k ? '#fff' : 'transparent', color: tab === k ? T.ink : T.ink3,
              boxShadow: tab === k ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            }}>{l}</button>
          ))}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar empresa o contacto…"
            style={{ border: `1px solid ${T.line}`, borderRadius: 9, padding: '8px 12px', fontSize: 13, outline: 'none', width: 200, background: '#fff' }} />
          <button onClick={() => setShowNew(true)} style={{
            background: T.brand, color: '#fff', border: 'none', borderRadius: 9,
            padding: '8px 16px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>+ Oportunidad</button>
        </div>
      </div>
      <p style={{ color: T.ink3, fontSize: 13, marginBottom: 20 }}>
        {tab === 'pipeline' ? 'Arrastra las oportunidades entre etapas. Al ganar, Operaciones recibe la tarea automáticamente.'
          : tab === 'empresas' ? 'Cartera de clientes y prospectos con su historial.'
          : 'Desempeño del embudo de ventas.'}
      </p>

      {loading && sales.length === 0 ? (
        <div style={{ color: T.ink3, padding: 20 }}>Cargando…</div>
      ) : tab === 'pipeline' ? (
        <Pipeline sales={sales} dragId={dragId} setDragId={setDragId} onMove={moveStage} onOpen={setOpenId} />
      ) : tab === 'empresas' ? (
        <Empresas sales={sales} onOpen={setOpenId} />
      ) : (
        <Reportes />
      )}

      {open && <DealDrawer sale={open} onClose={() => setOpenId(null)} onChange={() => load(true)} onMove={moveStage} />}
      {showNew && <NewDealModal onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); void load(true); }} />}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  PIPELINE (kanban)
// ═════════════════════════════════════════════════════════════════════════════
function Pipeline({ sales, dragId, setDragId, onMove, onOpen }: {
  sales: SSOSale[]; dragId: string | null; setDragId: (v: string | null) => void;
  onMove: (s: SSOSale, estado: string) => void; onOpen: (id: string) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 12, alignItems: 'flex-start' }}>
      {STAGES.map(st => {
        const col = sales.filter(s => s.estado === st.key);
        const total = col.reduce((a, s) => a + (s.monto_venta || 0), 0);
        return (
          <div key={st.key}
            onDragOver={e => e.preventDefault()}
            onDrop={() => { const s = sales.find(x => x.id === dragId); if (s) onMove(s, st.key); setDragId(null); }}
            style={{ width: 246, flexShrink: 0, background: '#F8FAFC', borderRadius: 14, padding: 10 }}>
            <div style={{ padding: '4px 6px 10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: st.color }} />
                <span style={{ fontSize: 12.5, fontWeight: 700, color: T.ink }}>{st.label}</span>
                <span style={{ fontSize: 11, color: T.ink3 }}>{col.length}</span>
              </div>
              <div style={{ fontSize: 11, color: T.ink3, marginTop: 2, paddingLeft: 15 }}>{money(total)}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {col.map(s => {
                const overdue = s.proxima_accion_fecha && s.proxima_accion_fecha < today() && !s.estado.startsWith('cerrado');
                return (
                  <div key={s.id} draggable onDragStart={() => setDragId(s.id)} onClick={() => onOpen(s.id)} style={{
                    background: '#fff', border: `1px solid ${overdue ? '#F09595' : T.line}`, borderRadius: 11,
                    padding: '11px 12px', cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                  }}
                    onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'}
                    onMouseLeave={e => e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: T.ink, marginBottom: 2 }}>{s.empresa}</div>
                    {s.servicio_contratado && <div style={{ fontSize: 11, color: T.ink3, marginBottom: 6 }}>{s.servicio_contratado}</div>}
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
                      <span style={{ fontSize: 15, fontWeight: 800, color: st.color }}>{money(s.monto_venta)}</span>
                      <span style={{ fontSize: 10.5, color: T.ink3 }}>{s.probabilidad}%</span>
                    </div>
                    {/* Barra probabilidad */}
                    <div style={{ height: 3, background: '#F1F5F9', borderRadius: 99, marginBottom: 8 }}>
                      <div style={{ height: 3, width: `${s.probabilidad}%`, background: st.color, borderRadius: 99 }} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div title={s.contacto_nombre} style={{
                        width: 20, height: 20, borderRadius: '50%', background: '#E6F1FB', color: T.brand,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, flexShrink: 0,
                      }}>{initials(s.contacto_nombre)}</div>
                      <span style={{ fontSize: 10.5, color: T.ink3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                        {s.contacto_nombre}
                      </span>
                      {s.proxima_accion_fecha && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: overdue ? '#A32D2D' : T.ink3 }}>
                          {overdue ? '⚠ ' : ''}{new Date(s.proxima_accion_fecha + 'T12:00:00').toLocaleDateString('es-EC', { day: 'numeric', month: 'short' })}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
              {col.length === 0 && (
                <div style={{ border: `1.5px dashed ${T.line}`, borderRadius: 10, padding: '18px 10px', textAlign: 'center', fontSize: 11, color: T.ink3 }}>
                  Arrastra aquí
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  EMPRESAS
// ═════════════════════════════════════════════════════════════════════════════
function Empresas({ sales, onOpen }: { sales: SSOSale[]; onOpen: (id: string) => void }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const empresas = useMemo(() => {
    const map = new Map<string, SSOSale[]>();
    for (const s of sales) {
      const k = s.empresa.trim();
      map.set(k, [...(map.get(k) ?? []), s]);
    }
    return [...map.entries()]
      .map(([name, deals]) => ({
        name, deals,
        open: deals.filter(d => !d.estado.startsWith('cerrado')),
        won: deals.filter(d => d.estado === 'cerrado_ganado'),
        totalOpen: deals.filter(d => !d.estado.startsWith('cerrado')).reduce((a, d) => a + d.monto_venta, 0),
        totalWon: deals.filter(d => d.estado === 'cerrado_ganado').reduce((a, d) => a + d.monto_venta, 0),
        contacts: [...new Set(deals.map(d => d.contacto_nombre).filter(Boolean))],
        lastUpdate: deals.map(d => d.updated_at).sort().reverse()[0],
      }))
      .sort((a, b) => (b.totalOpen + b.totalWon) - (a.totalOpen + a.totalWon));
  }, [sales]);

  if (empresas.length === 0) {
    return <div style={{ textAlign: 'center', padding: 48, color: T.ink3, fontSize: 13, background: '#fff', border: `1.5px dashed ${T.line}`, borderRadius: 14 }}>Sin empresas aún. Crea tu primera oportunidad.</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {empresas.map(e => (
        <div key={e.name} style={{ background: '#fff', border: `1px solid ${T.line}`, borderRadius: 12, overflow: 'hidden' }}>
          <div onClick={() => setExpanded(x => x === e.name ? null : e.name)} style={{
            display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', cursor: 'pointer',
          }}
            onMouseEnter={ev => ev.currentTarget.style.background = '#F8FAFC'}
            onMouseLeave={ev => ev.currentTarget.style.background = 'transparent'}>
            <div style={{
              width: 38, height: 38, borderRadius: 10, background: '#FAEEDA', color: '#854F0B',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, flexShrink: 0,
            }}>{e.name.charAt(0).toUpperCase()}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>{e.name}</div>
              <div style={{ fontSize: 11.5, color: T.ink3, marginTop: 1 }}>
                {e.contacts.slice(0, 2).join(' · ') || 'Sin contacto'} · actualizado {timeAgo(e.lastUpdate)}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 13.5, fontWeight: 800, color: T.brand }}>{money(e.totalOpen)}</div>
              <div style={{ fontSize: 10.5, color: T.ink3 }}>{e.open.length} abiertas</div>
            </div>
            <div style={{ textAlign: 'right', minWidth: 80 }}>
              <div style={{ fontSize: 13.5, fontWeight: 800, color: '#0F6E56' }}>{money(e.totalWon)}</div>
              <div style={{ fontSize: 10.5, color: T.ink3 }}>{e.won.length} ganadas</div>
            </div>
            <span style={{ color: T.ink3, fontSize: 12, transform: expanded === e.name ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>▸</span>
          </div>
          {expanded === e.name && (
            <div style={{ borderTop: `1px solid ${T.line}`, background: '#F8FAFC' }}>
              {e.deals.map(d => {
                const st = STAGES.find(s => s.key === d.estado);
                return (
                  <div key={d.id} onClick={() => onOpen(d.id)} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 18px 10px 70px',
                    borderBottom: `1px solid ${T.line}`, cursor: 'pointer', fontSize: 12.5,
                  }}
                    onMouseEnter={ev => ev.currentTarget.style.background = '#F1F5F9'}
                    onMouseLeave={ev => ev.currentTarget.style.background = 'transparent'}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: st?.color }} />
                    <span style={{ flex: 1, color: T.ink, fontWeight: 500 }}>{d.servicio_contratado || 'Oportunidad'}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: st?.color }}>{st?.label}</span>
                    <span style={{ fontWeight: 700, color: T.ink2, minWidth: 76, textAlign: 'right' }}>{money(d.monto_venta)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  REPORTES
// ═════════════════════════════════════════════════════════════════════════════
function Reportes() {
  const [stats, setStats] = useState<{ totalPipeline: number; totalGanado: number; totalSales: number; closedWon: number; conversionRate: number; byStage: { estado: string; count: number; total: number }[] } | null>(null);

  useEffect(() => { api.getSSOStats().then(r => setStats(r.data)); }, []);
  if (!stats) return <div style={{ color: T.ink3, padding: 20 }}>Cargando…</div>;

  const maxTotal = Math.max(...stats.byStage.map(s => s.total), 1);
  const ticket = stats.closedWon > 0 ? stats.totalGanado / stats.closedWon : 0;

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { l: 'Pipeline total', v: money(stats.totalPipeline), c: T.brand },
          { l: 'Ganado', v: money(stats.totalGanado), c: '#0F6E56' },
          { l: 'Conversión', v: `${Math.round(stats.conversionRate)}%`, c: '#534AB7' },
          { l: 'Ticket promedio', v: money(ticket), c: '#854F0B' },
        ].map(k => (
          <div key={k.l} style={{ background: '#fff', border: `1px solid ${T.line}`, borderRadius: 12, padding: '16px 18px' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: T.ink3, marginBottom: 6 }}>{k.l}</div>
            <div style={{ fontSize: 26, fontWeight: 900, color: k.c, letterSpacing: -0.8 }}>{k.v}</div>
          </div>
        ))}
      </div>

      <div style={{ background: '#fff', border: `1px solid ${T.line}`, borderRadius: 12, padding: '20px 22px' }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: T.ink, marginBottom: 16 }}>Valor por etapa</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {STAGES.map(st => {
            const row = stats.byStage.find(s => s.estado === st.key);
            const total = row?.total ?? 0;
            return (
              <div key={st.key} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 12, color: T.ink2, minWidth: 90 }}>{st.label}</span>
                <div style={{ flex: 1, height: 22, background: '#F1F5F9', borderRadius: 6, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(total / maxTotal) * 100}%`, background: st.color, borderRadius: 6, transition: 'width .3s' }} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: T.ink, minWidth: 84, textAlign: 'right' }}>{money(total)}</span>
                <span style={{ fontSize: 11, color: T.ink3, minWidth: 24, textAlign: 'right' }}>{row?.count ?? 0}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  FICHA DE OPORTUNIDAD (drawer con timeline)
// ═════════════════════════════════════════════════════════════════════════════
function DealDrawer({ sale, onClose, onChange, onMove }: {
  sale: SSOSale; onClose: () => void; onChange: () => void;
  onMove: (s: SSOSale, estado: string) => void;
}) {
  const { accounts } = useMsal();
  const [local, setLocal] = useState<SSOSale>(sale);
  const [acts, setActs] = useState<SSOActivity[]>([]);
  const [actType, setActType] = useState('nota');
  const [actBody, setActBody] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [nextDate, setNextDate] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => { setLocal(sale); }, [sale]);

  const loadActs = useCallback(async () => {
    const r = await api.getSSOActivities(sale.id);
    setActs(r.data);
  }, [sale.id]);
  useEffect(() => { void loadActs(); }, [loadActs]);

  async function patch(body: Partial<SSOSale>) {
    setLocal(l => ({ ...l, ...body }));
    await api.updateSSOSale(sale.id, body);
    onChange();
  }

  async function addActivity() {
    if (!actBody.trim() || sending) return;
    setSending(true);
    try {
      await api.addSSOActivity(sale.id, {
        type: actType, body: actBody.trim(),
        ...(nextAction || nextDate ? { proxima_accion: nextAction, proxima_accion_fecha: nextDate } : {}),
      });
      setActBody(''); setNextAction(''); setNextDate('');
      await loadActs();
      onChange();
    } finally { setSending(false); }
  }

  const st = STAGES.find(s => s.key === local.estado);
  const overdue = local.proxima_accion_fecha && local.proxima_accion_fecha < today() && !local.estado.startsWith('cerrado');

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.35)', backdropFilter: 'blur(2px)', zIndex: 1000, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 480, maxWidth: '95vw', height: '100vh', background: '#fff',
        boxShadow: '-12px 0 40px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column',
      }}>
        {/* Head */}
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${T.line}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: '#FAEEDA', color: '#854F0B', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 800 }}>
              {local.empresa.charAt(0).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: T.ink }}>{local.empresa}</div>
              <div style={{ fontSize: 11.5, color: T.ink3 }}>{local.servicio_contratado || 'Sin servicio definido'}</div>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: T.ink3, cursor: 'pointer', fontSize: 17 }}>✕</button>
          </div>
          {/* Etapas clicables */}
          <div style={{ display: 'flex', gap: 4, marginTop: 12 }}>
            {STAGES.map(s => (
              <button key={s.key} onClick={() => onMove(local, s.key)} style={{
                flex: 1, border: 'none', borderRadius: 6, padding: '5px 2px', fontSize: 10, fontWeight: 700, cursor: 'pointer',
                background: local.estado === s.key ? s.color : '#F1F5F9',
                color: local.estado === s.key ? '#fff' : T.ink3,
              }}>{s.label}</button>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {/* Próxima acción destacada */}
          {(local.proxima_accion || local.proxima_accion_fecha) && (
            <div style={{ margin: '14px 20px 0', padding: '10px 14px', borderRadius: 10, background: overdue ? '#FCEBEB' : '#E6F1FB', display: 'flex', gap: 10, alignItems: 'center' }}>
              <span style={{ fontSize: 15 }}>{overdue ? '⚠' : '➤'}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: overdue ? '#A32D2D' : '#185FA5' }}>{local.proxima_accion || 'Próxima acción'}</div>
                {local.proxima_accion_fecha && <div style={{ fontSize: 11, color: overdue ? '#A32D2D' : T.ink3 }}>
                  {new Date(local.proxima_accion_fecha + 'T12:00:00').toLocaleDateString('es-EC', { weekday: 'long', day: 'numeric', month: 'long' })}{overdue ? ' — vencida' : ''}
                </div>}
              </div>
            </div>
          )}

          {/* Datos */}
          <div style={{ padding: '16px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, borderBottom: `1px solid ${T.line}` }}>
            <Fld label="Monto (USD)">
              <input type="number" value={local.monto_venta} onChange={e => setLocal(l => ({ ...l, monto_venta: +e.target.value }))}
                onBlur={e => patch({ monto_venta: +e.target.value })} style={inp} />
            </Fld>
            <Fld label="Probabilidad %">
              <input type="number" min={0} max={100} value={local.probabilidad} onChange={e => setLocal(l => ({ ...l, probabilidad: +e.target.value }))}
                onBlur={e => patch({ probabilidad: +e.target.value })} style={inp} />
            </Fld>
            <Fld label="Servicio">
              <select value={local.servicio_contratado ?? ''} onChange={e => patch({ servicio_contratado: e.target.value })} style={inp}>
                <option value="">—</option>
                {SERVICIOS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Fld>
            <Fld label="Origen">
              <select value={local.origen ?? ''} onChange={e => patch({ origen: e.target.value })} style={inp}>
                <option value="">—</option>
                {ORIGENES.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </Fld>
            <Fld label="Contacto">
              <input value={local.contacto_nombre} onChange={e => setLocal(l => ({ ...l, contacto_nombre: e.target.value }))}
                onBlur={e => patch({ contacto_nombre: e.target.value })} style={inp} />
            </Fld>
            <Fld label="Teléfono">
              <input value={local.contacto_telefono} onChange={e => setLocal(l => ({ ...l, contacto_telefono: e.target.value }))}
                onBlur={e => patch({ contacto_telefono: e.target.value })} style={inp} />
            </Fld>
            <Fld label="Correo" span>
              <input value={local.contacto_correo} onChange={e => setLocal(l => ({ ...l, contacto_correo: e.target.value }))}
                onBlur={e => patch({ contacto_correo: e.target.value })} style={inp} />
            </Fld>
            <Fld label="N° contrato">
              <input value={local.numero_contrato ?? ''} onChange={e => setLocal(l => ({ ...l, numero_contrato: e.target.value }))}
                onBlur={e => patch({ numero_contrato: e.target.value })} style={inp} />
            </Fld>
            <Fld label="N° cotización">
              <input value={local.numero_cotizacion ?? ''} onChange={e => setLocal(l => ({ ...l, numero_cotizacion: e.target.value }))}
                onBlur={e => patch({ numero_cotizacion: e.target.value })} style={inp} />
            </Fld>
          </div>

          {/* Timeline */}
          <div style={{ padding: '14px 20px 20px' }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: T.ink3, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
              Seguimiento ({acts.length})
            </div>
            {acts.length === 0 && (
              <div style={{ fontSize: 12.5, color: T.ink3, padding: '8px 0 4px' }}>
                Registra llamadas, reuniones y notas para no perder el hilo.
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {acts.map((a, i) => {
                const at = ACT_TYPES.find(t => t.key === a.type);
                return (
                  <div key={a.id} style={{ display: 'flex', gap: 12 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <div style={{ width: 26, height: 26, borderRadius: '50%', background: '#F1F5F9', color: T.ink2, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, flexShrink: 0 }}>
                        {at?.icon ?? '✎'}
                      </div>
                      {i < acts.length - 1 && <div style={{ width: 2, flex: 1, background: T.line, minHeight: 10 }} />}
                    </div>
                    <div style={{ paddingBottom: 14, flex: 1 }}>
                      <div style={{ fontSize: 11.5, color: T.ink3 }}>
                        <span style={{ fontWeight: 700, color: T.ink2 }}>{a.author_name || '—'}</span> · {at?.label ?? a.type} · {timeAgo(a.created_at)}
                      </div>
                      <div style={{ fontSize: 13, color: T.ink, marginTop: 2, lineHeight: 1.5 }}>{a.body}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Composer */}
        <div style={{ borderTop: `1px solid ${T.line}`, padding: '12px 20px', background: '#FAFBFC' }}>
          <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
            {ACT_TYPES.map(t => (
              <button key={t.key} onClick={() => setActType(t.key)} style={{
                border: actType === t.key ? `1.5px solid ${T.brand}` : `1px solid ${T.line}`,
                background: actType === t.key ? 'rgba(2,132,199,0.06)' : '#fff',
                color: actType === t.key ? T.brand : T.ink3,
                borderRadius: 99, padding: '4px 11px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
              }}>{t.icon} {t.label}</button>
            ))}
          </div>
          <textarea
            value={actBody} onChange={e => setActBody(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) addActivity(); }}
            placeholder={`Registrar ${ACT_TYPES.find(t => t.key === actType)?.label.toLowerCase()}…`}
            rows={2}
            style={{ width: '100%', border: `1px solid ${T.line}`, borderRadius: 9, padding: '9px 11px', fontSize: 13, resize: 'none', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', marginBottom: 8 }}
          />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input value={nextAction} onChange={e => setNextAction(e.target.value)} placeholder="Próxima acción (ej. enviar propuesta)"
              style={{ flex: 1, border: `1px solid ${T.line}`, borderRadius: 8, padding: '7px 10px', fontSize: 12, outline: 'none', fontFamily: 'inherit' }} />
            <input type="date" value={nextDate} onChange={e => setNextDate(e.target.value)}
              style={{ border: `1px solid ${T.line}`, borderRadius: 8, padding: '7px 8px', fontSize: 12, outline: 'none', fontFamily: 'inherit' }} />
            <button onClick={addActivity} disabled={sending || !actBody.trim()} style={{
              background: T.brand, color: '#fff', border: 'none', borderRadius: 8,
              padding: '8px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              opacity: sending || !actBody.trim() ? 0.5 : 1,
            }}>{sending ? '…' : 'Guardar'}</button>
          </div>
          <div style={{ fontSize: 10.5, color: T.ink3, marginTop: 6 }}>
            Registrado como {accounts[0]?.name?.split(' ')[0] ?? 'tú'} · el estado actual es <strong style={{ color: st?.color }}>{st?.label}</strong>
          </div>
        </div>
      </div>
    </div>
  );
}

function Fld({ label, children, span }: { label: string; children: React.ReactNode; span?: boolean }) {
  return (
    <div style={span ? { gridColumn: '1 / -1' } : undefined}>
      <label style={{ display: 'block', fontSize: 10, fontWeight: 800, color: T.ink3, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  NUEVA OPORTUNIDAD
// ═════════════════════════════════════════════════════════════════════════════
function NewDealModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [f, setF] = useState({
    empresa: '', contacto_nombre: '', contacto_correo: '', contacto_telefono: '',
    monto_venta: 0, servicio_contratado: '', origen: '', estado: 'prospecto',
  });
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: unknown) => setF(x => ({ ...x, [k]: v }));

  async function create() {
    if (!f.empresa.trim() || !f.contacto_nombre.trim() || saving) return;
    setSaving(true);
    try {
      await api.createSSOSale({
        ...f, empresa: f.empresa.trim(),
        probabilidad: STAGE_PROB[f.estado] ?? 20,
      } as Partial<SSOSale>);
      onCreated();
    } finally { setSaving(false); }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 1200, padding: '8vh 20px 20px' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 500, maxWidth: '94vw', background: '#fff', borderRadius: 16, boxShadow: '0 24px 64px rgba(0,0,0,0.24)', overflow: 'hidden' }}>
        <div style={{ height: 5, background: '#BA7517' }} />
        <div style={{ padding: '18px 22px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <span style={{ fontSize: 15, fontWeight: 800, color: T.ink }}>Nueva oportunidad</span>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: T.ink3, cursor: 'pointer', fontSize: 17 }}>✕</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Fld label="Empresa *" span>
              <input autoFocus value={f.empresa} onChange={e => set('empresa', e.target.value)} placeholder="Nombre de la empresa" style={inp} />
            </Fld>
            <Fld label="Contacto *">
              <input value={f.contacto_nombre} onChange={e => set('contacto_nombre', e.target.value)} style={inp} />
            </Fld>
            <Fld label="Teléfono">
              <input value={f.contacto_telefono} onChange={e => set('contacto_telefono', e.target.value)} style={inp} />
            </Fld>
            <Fld label="Correo" span>
              <input value={f.contacto_correo} onChange={e => set('contacto_correo', e.target.value)} placeholder="contacto@empresa.com" style={inp} />
            </Fld>
            <Fld label="Monto estimado (USD)">
              <input type="number" value={f.monto_venta || ''} onChange={e => set('monto_venta', +e.target.value)} placeholder="0" style={inp} />
            </Fld>
            <Fld label="Etapa inicial">
              <select value={f.estado} onChange={e => set('estado', e.target.value)} style={inp}>
                {STAGES.filter(s => !s.key.startsWith('cerrado')).map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </Fld>
            <Fld label="Servicio">
              <select value={f.servicio_contratado} onChange={e => set('servicio_contratado', e.target.value)} style={inp}>
                <option value="">—</option>
                {SERVICIOS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Fld>
            <Fld label="Origen">
              <select value={f.origen} onChange={e => set('origen', e.target.value)} style={inp}>
                <option value="">—</option>
                {ORIGENES.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </Fld>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18, borderTop: `1px solid ${T.line}`, paddingTop: 14 }}>
            <button onClick={onClose} style={{ background: 'none', border: `1px solid ${T.line}`, borderRadius: 9, padding: '9px 16px', fontSize: 12.5, fontWeight: 600, color: T.ink2, cursor: 'pointer' }}>Cancelar</button>
            <button onClick={create} disabled={saving || !f.empresa.trim() || !f.contacto_nombre.trim()} style={{
              background: T.brand, color: '#fff', border: 'none', borderRadius: 9, padding: '9px 20px',
              fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
              opacity: saving || !f.empresa.trim() || !f.contacto_nombre.trim() ? 0.5 : 1,
            }}>{saving ? 'Creando…' : 'Crear oportunidad'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

const inp: React.CSSProperties = {
  width: '100%', border: '1px solid #E2E8F0', borderRadius: 8, padding: '8px 10px',
  fontSize: 13, background: '#fff', color: '#0F172A', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
};
