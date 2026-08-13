import { useEffect, useState, useCallback, useRef } from 'react';
import {
  api,
  InventoryDashboard,
  InventoryKardexRow,
  InventoryStockRow,
  InventoryItemCatalog,
  KardexFilters,
} from '../lib/api';

// ─── Constantes ──────────────────────────────────────────────────────────────
const PAGE_SIZE = 50;

// ─── Página principal ─────────────────────────────────────────────────────────
export default function Inventory() {
  const [tab, setTab] = useState<'stock' | 'kardex'>('stock');
  const [dashboard, setDashboard] = useState<InventoryDashboard | null>(null);
  const [stock, setStock] = useState<InventoryStockRow[]>([]);
  const [kardex, setKardex] = useState<InventoryKardexRow[]>([]);
  const [kardexTotal, setKardexTotal] = useState(0);
  const [kardexPage, setKardexPage] = useState(0);
  const [items, setItems] = useState<InventoryItemCatalog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filtros Kardex
  const [filterItem, setFilterItem] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [filterSearch, setFilterSearch] = useState('');
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Modal
  const [showModal, setShowModal] = useState(false);

  // ── Carga inicial ──────────────────────────────────────────────────────────
  const loadDashboard = useCallback(async () => {
    const res = await api.inventoryDashboard();
    setDashboard(res.data);
  }, []);

  const loadStock = useCallback(async () => {
    const res = await api.inventoryStock();
    setStock(res.data);
  }, []);

  const loadKardex = useCallback(async (page = 0, filters: KardexFilters = {}) => {
    const res = await api.inventoryKardex({
      ...filters,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    });
    setKardex(res.data);
    setKardexTotal(res.total);
    setKardexPage(page);
  }, []);

  const loadItems = useCallback(async () => {
    const res = await api.inventoryItems('');
    setItems(res.data);
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      await Promise.all([loadDashboard(), loadStock(), loadItems()]);
      await loadKardex(0, buildKardexFilters());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el inventario.');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { void loadAll(); }, [loadAll]);

  // ── Filtros con debounce ───────────────────────────────────────────────────
  function buildKardexFilters(): KardexFilters {
    return {
      item_id: filterItem || undefined,
      entry_type: filterType || undefined,
      from_date: filterFrom || undefined,
      to_date: filterTo || undefined,
      q: filterSearch || undefined,
    };
  }

  function applyKardexFilters(overrides: Partial<KardexFilters> = {}) {
    const filters: KardexFilters = {
      item_id: filterItem || undefined,
      entry_type: filterType || undefined,
      from_date: filterFrom || undefined,
      to_date: filterTo || undefined,
      q: filterSearch || undefined,
      ...overrides,
    };
    void loadKardex(0, filters);
  }

  function onSearchChange(val: string) {
    setFilterSearch(val);
    if (searchRef.current) clearTimeout(searchRef.current);
    searchRef.current = setTimeout(() => {
      applyKardexFilters({ q: val || undefined });
    }, 400);
  }

  function onFilterChange<K extends keyof KardexFilters>(key: K, val: string) {
    if (key === 'item_id') setFilterItem(val);
    if (key === 'entry_type') setFilterType(val);
    if (key === 'from_date') setFilterFrom(val);
    if (key === 'to_date') setFilterTo(val);
    applyKardexFilters({ [key]: val || undefined });
  }

  function clearFilters() {
    setFilterItem('');
    setFilterType('');
    setFilterFrom('');
    setFilterTo('');
    setFilterSearch('');
    void loadKardex(0, {});
  }

  const hasFilters = !!(filterItem || filterType || filterFrom || filterTo || filterSearch);
  const totalPages = Math.ceil(kardexTotal / PAGE_SIZE);

  // ── Exportar ───────────────────────────────────────────────────────────────
  async function handleExportStock() {
    const token = await getToken();
    const url = api.exportInventoryStock();
    downloadWithAuth(url, 'stock_pop.csv', token);
  }

  async function handleExportKardex() {
    const token = await getToken();
    const url = api.exportInventoryKardex();
    downloadWithAuth(url, 'kardex_pop.csv', token);
  }

  // ── Refrescar después de nuevo movimiento ─────────────────────────────────
  async function onMovementCreated() {
    setShowModal(false);
    try {
      await Promise.all([loadDashboard(), loadStock()]);
      await loadKardex(0, buildKardexFilters());
    } catch { /* ignore */ }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '28px 32px', display: 'grid', gap: 20, maxWidth: 1300 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10, background: '#0284C7',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <IconBox />
            </div>
            <h1 style={{ fontSize: 26, fontWeight: 900, color: '#111', letterSpacing: -0.5 }}>
              Bodega Material POP
            </h1>
          </div>
          <p style={{ color: '#777', fontSize: 13, paddingLeft: 46 }}>
            Control de inventario de material publicitario y marketing
          </p>
        </div>
        <button onClick={() => setShowModal(true)} style={btnPrimary}>
          + Registrar movimiento
        </button>
      </div>

      {/* KPIs */}
      <DashboardCards dashboard={dashboard} />

      {/* Error */}
      {error && (
        <div style={{ background: '#FFF2EC', border: '1px solid #F0997B', color: '#993C1D', borderRadius: 10, padding: '10px 14px', fontSize: 13, fontWeight: 600 }}>
          {error}
        </div>
      )}

      {/* Tabs + Exportar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button onClick={() => setTab('stock')} style={tabBtn(tab === 'stock')}>Stock actual</button>
        <button onClick={() => setTab('kardex')} style={tabBtn(tab === 'kardex')}>Kardex</button>
        <button onClick={loadAll} style={tabBtn(false)} title="Refrescar datos">
          <IconRefresh /> Refrescar
        </button>
        <div style={{ flex: 1 }} />
        <button onClick={handleExportStock} style={btnSecondary} title="Exportar stock a CSV">
          <IconDownload /> Stock CSV
        </button>
        <button onClick={handleExportKardex} style={btnSecondary} title="Exportar Kardex a CSV">
          <IconDownload /> Kardex CSV
        </button>
      </div>

      {/* Filtros Kardex */}
      {tab === 'kardex' && (
        <KardexFiltersBar
          items={items}
          filterItem={filterItem}
          filterType={filterType}
          filterFrom={filterFrom}
          filterTo={filterTo}
          filterSearch={filterSearch}
          hasFilters={hasFilters}
          onSearchChange={onSearchChange}
          onFilterChange={onFilterChange}
          onClear={clearFilters}
        />
      )}

      {/* Contenido */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 48, color: '#888', fontSize: 14 }}>
          Cargando inventario...
        </div>
      ) : tab === 'stock' ? (
        <StockTable rows={stock} />
      ) : (
        <>
          <KardexTable rows={kardex} total={kardexTotal} />
          {totalPages > 1 && (
            <Pager
              page={kardexPage}
              total={totalPages}
              onPage={(p) => loadKardex(p, buildKardexFilters())}
            />
          )}
        </>
      )}

      {/* Modal nuevo movimiento */}
      {showModal && (
        <MovementModal
          items={items}
          onClose={() => setShowModal(false)}
          onCreated={onMovementCreated}
        />
      )}
    </div>
  );
}

// ─── KPIs ─────────────────────────────────────────────────────────────────────
function DashboardCards({ dashboard }: { dashboard: InventoryDashboard | null }) {
  const d = dashboard ?? { total_units: 0, total_value: 0, expired_lots: 0, expiring_lots_30d: 0, critical_items: 0 };
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14 }}>
      <KpiCard icon="💰" label="Valor inventario" value={'$' + money(d.total_value)} color="#0284C7" />
      <KpiCard icon="📦" label="Unidades en bodega" value={num(d.total_units)} color="#10B981" />
      <KpiCard icon="⚠️" label="Stock crítico" value={String(d.critical_items)} color={d.critical_items > 0 ? '#C77D00' : '#10B981'} />
      <KpiCard icon="🚫" label="Lotes vencidos" value={String(d.expired_lots)} color={d.expired_lots > 0 ? '#993C1D' : '#10B981'} />
      <KpiCard icon="🕐" label="Vencen en 30 días" value={String(d.expiring_lots_30d)} color={d.expiring_lots_30d > 0 ? '#C77D00' : '#10B981'} />
    </div>
  );
}

function KpiCard({ icon, label, value, color }: { icon: string; label: string; value: string; color: string }) {
  return (
    <div style={{
      background: '#fff', border: '1px solid #E6E4DE', borderRadius: 14,
      padding: '16px 18px', boxShadow: '0 2px 8px rgba(0,0,0,.04)',
      borderTop: `4px solid ${color}`,
    }}>
      <div style={{ fontSize: 20, marginBottom: 6 }}>{icon}</div>
      <div style={{ fontSize: 22, fontWeight: 900, color: '#111', marginBottom: 2 }}>{value}</div>
      <div style={{ fontSize: 11, color: '#888', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
    </div>
  );
}

// ─── Filtros Kardex ───────────────────────────────────────────────────────────
function KardexFiltersBar({
  items, filterItem, filterType, filterFrom, filterTo, filterSearch,
  hasFilters, onSearchChange, onFilterChange, onClear,
}: {
  items: InventoryItemCatalog[];
  filterItem: string; filterType: string; filterFrom: string; filterTo: string; filterSearch: string;
  hasFilters: boolean;
  onSearchChange: (v: string) => void;
  onFilterChange: <K extends keyof KardexFilters>(k: K, v: string) => void;
  onClear: () => void;
}) {
  return (
    <div style={{
      background: '#fff', border: '1px solid #E6E4DE', borderRadius: 12,
      padding: '14px 16px', display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center',
    }}>
      <input
        placeholder="Buscar por SKU o nombre..."
        value={filterSearch}
        onChange={e => onSearchChange(e.target.value)}
        style={inputStyle}
      />
      <select value={filterItem} onChange={e => onFilterChange('item_id', e.target.value)} style={selectStyle}>
        <option value="">Todos los ítems</option>
        {items.map(i => (
          <option key={i.id} value={i.id}>{i.sku} – {i.name}</option>
        ))}
      </select>
      <select value={filterType} onChange={e => onFilterChange('entry_type', e.target.value)} style={selectStyle}>
        <option value="">Entradas y salidas</option>
        <option value="IN">Entradas (IN)</option>
        <option value="OUT">Salidas (OUT)</option>
      </select>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 12, color: '#888', fontWeight: 600 }}>Desde</span>
        <input type="date" value={filterFrom} onChange={e => onFilterChange('from_date', e.target.value)} style={{ ...inputStyle, width: 140 }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 12, color: '#888', fontWeight: 600 }}>Hasta</span>
        <input type="date" value={filterTo} onChange={e => onFilterChange('to_date', e.target.value)} style={{ ...inputStyle, width: 140 }} />
      </div>
      {hasFilters && (
        <button onClick={onClear} style={{ ...btnSecondary, fontSize: 12, padding: '7px 12px', color: '#993C1D', borderColor: '#F0997B' }}>
          Limpiar filtros
        </button>
      )}
    </div>
  );
}

// ─── Tabla Stock ──────────────────────────────────────────────────────────────
function StockTable({ rows }: { rows: InventoryStockRow[] }) {
  if (!rows.length) return (
    <EmptyState icon="📦" title="Sin stock registrado" subtitle="Registra un movimiento de entrada para comenzar." />
  );

  // Agrupar por item para resumen
  const byItem: Record<string, { sku: string; name: string; unit: string; qty: number; value: number; lots: number }> = {};
  for (const r of rows) {
    if (!byItem[r.item_id]) byItem[r.item_id] = { sku: r.sku, name: r.item_name, unit: r.unit, qty: 0, value: 0, lots: 0 };
    byItem[r.item_id].qty += r.quantity_on_hand;
    byItem[r.item_id].value += r.total_value;
    if (r.lot_id) byItem[r.item_id].lots++;
  }

  return (
    <div style={cardStyle}>
      <div style={{ padding: '16px 18px', borderBottom: '1px solid #ECECEA', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={sectionTitle}>Stock actual — Material POP</h2>
        <span style={{ fontSize: 12, color: '#888', fontWeight: 600 }}>{rows.length} {rows.length === 1 ? 'registro' : 'registros'}</span>
      </div>
      <table style={tableStyle}>
        <thead>
          <tr style={{ background: '#FAFAF8' }}>
            <Th>SKU</Th>
            <Th>Material POP</Th>
            <Th>Unidad</Th>
            <Th>Lote</Th>
            <Th>Vencimiento</Th>
            <Th align="right">Cantidad</Th>
            <Th align="right">Costo prom.</Th>
            <Th align="right">Valor total</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const expiring = isExpiringSoon(r.expiration_date);
            const expired = isExpired(r.expiration_date);
            return (
              <tr key={i} style={{ background: expired ? '#FFF5F5' : expiring ? '#FFFBF0' : undefined }}>
                <Td>
                  <span style={{ fontFamily: 'monospace', fontSize: 12, background: '#F9F9FB', padding: '2px 6px', borderRadius: 4 }}>
                    {r.sku}
                  </span>
                </Td>
                <Td><span style={{ fontWeight: 600 }}>{r.item_name}</span></Td>
                <Td>{r.unit}</Td>
                <Td>{r.lot_code || <span style={{ color: '#bbb' }}>—</span>}</Td>
                <Td>
                  {r.expiration_date ? (
                    <span style={{
                      color: expired ? '#993C1D' : expiring ? '#C77D00' : '#10B981',
                      fontWeight: expired || expiring ? 700 : 400,
                    }}>
                      {r.expiration_date} {expired ? '🚫' : expiring ? '⚠️' : ''}
                    </span>
                  ) : <span style={{ color: '#bbb' }}>—</span>}
                </Td>
                <Td align="right"><strong>{num(r.quantity_on_hand)}</strong></Td>
                <Td align="right">{money(r.average_cost)}</Td>
                <Td align="right" bold>{money(r.total_value)}</Td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr style={{ background: '#F7F7F5', borderTop: '2px solid #E6E4DE' }}>
            <Td colSpan={5}><strong>TOTAL</strong></Td>
            <Td align="right"><strong>{num(rows.reduce((s, r) => s + r.quantity_on_hand, 0))}</strong></Td>
            <Td />
            <Td align="right"><strong>${money(rows.reduce((s, r) => s + r.total_value, 0))}</strong></Td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ─── Tabla Kardex ──────────────────────────────────────────────────────────────
function KardexTable({ rows, total }: { rows: InventoryKardexRow[]; total: number }) {
  if (!rows.length) return (
    <EmptyState icon="📋" title="Sin movimientos en el Kardex" subtitle="Registra entradas o salidas para ver el historial aquí." />
  );

  return (
    <div style={cardStyle}>
      <div style={{ padding: '16px 18px', borderBottom: '1px solid #ECECEA', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={sectionTitle}>Kardex Material POP</h2>
        <span style={{ fontSize: 12, color: '#888', fontWeight: 600 }}>{total.toLocaleString('es-EC')} movimientos</span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={tableStyle}>
          <thead>
            <tr style={{ background: '#FAFAF8' }}>
              <Th>Fecha</Th>
              <Th>N° Movimiento</Th>
              <Th>Tipo</Th>
              <Th>SKU</Th>
              <Th>Material POP</Th>
              <Th>Lote</Th>
              <Th>Referencia</Th>
              <Th>Usuario</Th>
              <Th align="right">Entrada</Th>
              <Th align="right">Salida</Th>
              <Th align="right">Saldo Uds.</Th>
              <Th align="right">Costo unit.</Th>
              <Th align="right">Valor saldo</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const isIn = r.entry_type === 'IN';
              return (
                <tr key={r.id} style={{ borderBottom: '1px solid #F0EFEA' }}>
                  <Td>
                    <div style={{ fontSize: 12 }}>{fmtDate(r.created_at)}</div>
                    <div style={{ fontSize: 10, color: '#aaa' }}>{fmtTime(r.created_at)}</div>
                  </Td>
                  <Td>
                    <span style={{ fontFamily: 'monospace', fontSize: 11, background: '#F9F9FB', padding: '2px 5px', borderRadius: 4 }}>
                      {r.movement_number}
                    </span>
                  </Td>
                  <Td>
                    <span style={{
                      display: 'inline-block', padding: '3px 8px', borderRadius: 999, fontSize: 11, fontWeight: 800,
                      background: isIn ? '#E6F7F1' : '#FFF0E8',
                      color: isIn ? '#1D7A5A' : '#9A4A1A',
                    }}>
                      {isIn ? '↓ ENTRADA' : '↑ SALIDA'}
                    </span>
                  </Td>
                  <Td>
                    <span style={{ fontFamily: 'monospace', fontSize: 11, background: '#F9F9FB', padding: '2px 5px', borderRadius: 4 }}>
                      {r.sku}
                    </span>
                  </Td>
                  <Td><span style={{ fontWeight: 500 }}>{r.item_name}</span></Td>
                  <Td>{r.lot_code || <span style={{ color: '#bbb' }}>—</span>}</Td>
                  <Td>
                    {r.reference_number ? (
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 600 }}>{r.reference_number}</div>
                        {r.reference_type && <div style={{ fontSize: 10, color: '#aaa' }}>{r.reference_type}</div>}
                      </div>
                    ) : r.movement_notes ? (
                      <span style={{ fontSize: 11, color: '#888', fontStyle: 'italic' }}>{r.movement_notes.slice(0, 30)}</span>
                    ) : <span style={{ color: '#bbb' }}>—</span>}
                  </Td>
                  <Td>{r.created_by_name ? <span style={{ fontSize: 11 }}>{r.created_by_name}</span> : <span style={{ color: '#bbb' }}>—</span>}</Td>
                  <Td align="right">
                    {r.quantity_in > 0
                      ? <span style={{ color: '#1D7A5A', fontWeight: 700 }}>+{num(r.quantity_in)}</span>
                      : <span style={{ color: '#bbb' }}>—</span>}
                  </Td>
                  <Td align="right">
                    {r.quantity_out > 0
                      ? <span style={{ color: '#9A4A1A', fontWeight: 700 }}>-{num(r.quantity_out)}</span>
                      : <span style={{ color: '#bbb' }}>—</span>}
                  </Td>
                  <Td align="right"><strong>{num(r.balance_quantity)}</strong></Td>
                  <Td align="right">{money(r.balance_unit_cost)}</Td>
                  <Td align="right"><strong>${money(r.balance_total_value)}</strong></Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Paginación ───────────────────────────────────────────────────────────────
function Pager({ page, total, onPage }: { page: number; total: number; onPage: (p: number) => void }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10 }}>
      <button disabled={page === 0} onClick={() => onPage(0)} style={pagerBtn(page === 0)}>«</button>
      <button disabled={page === 0} onClick={() => onPage(page - 1)} style={pagerBtn(page === 0)}>‹</button>
      <span style={{ fontSize: 13, color: '#555' }}>Página <strong>{page + 1}</strong> de <strong>{total}</strong></span>
      <button disabled={page >= total - 1} onClick={() => onPage(page + 1)} style={pagerBtn(page >= total - 1)}>›</button>
      <button disabled={page >= total - 1} onClick={() => onPage(total - 1)} style={pagerBtn(page >= total - 1)}>»</button>
    </div>
  );
}

// ─── Modal: Registrar Movimiento ──────────────────────────────────────────────
type MovLine = { item_id: string; quantity: string; unit_cost: string; notes: string };

function MovementModal({
  items,
  onClose,
  onCreated,
}: {
  items: InventoryItemCatalog[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [movType, setMovType] = useState<'IN' | 'OUT'>('IN');
  const [refType, setRefType] = useState('');
  const [refNumber, setRefNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<MovLine[]>([{ item_id: '', quantity: '', unit_cost: '', notes: '' }]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);

  const REF_TYPES = [
    { value: 'CAMPAÑA', label: 'Campaña de marketing' },
    { value: 'EVENTO', label: 'Evento / activación' },
    { value: 'PDV', label: 'Punto de venta' },
    { value: 'PROVEEDOR', label: 'Proveedor' },
    { value: 'DEVOLUCION', label: 'Devolución' },
    { value: 'OTRO', label: 'Otro' },
  ];

  function addLine() {
    setLines(l => [...l, { item_id: '', quantity: '', unit_cost: '', notes: '' }]);
  }

  function removeLine(idx: number) {
    setLines(l => l.filter((_, i) => i !== idx));
  }

  function updateLine(idx: number, field: keyof MovLine, val: string) {
    setLines(l => l.map((row, i) => i === idx ? { ...row, [field]: val } : row));
  }

  async function handleSave() {
    setFormError('');
    const validLines = lines.filter(l => l.item_id && Number(l.quantity) > 0);
    if (!validLines.length) {
      setFormError('Agrega al menos un ítem con cantidad mayor a 0.');
      return;
    }
    if (movType === 'IN' && validLines.some(l => !l.unit_cost || Number(l.unit_cost) < 0)) {
      setFormError('Para entradas, ingresa el costo unitario.');
      return;
    }

    setSaving(true);
    try {
      const created = await api.createInventoryMovement({
        movement_type: movType,
        source_location_id: movType === 'OUT' ? 'default' : null,
        target_location_id: movType === 'IN' ? 'default' : null,
        reference_type: refType || undefined,
        reference_number: refNumber || undefined,
        notes: notes || undefined,
        lines: validLines.map(l => ({
          item_id: l.item_id,
          quantity: Number(l.quantity),
          unit_cost: Number(l.unit_cost) || 0,
          total_cost: Number(l.quantity) * (Number(l.unit_cost) || 0),
          notes: l.notes || undefined,
        })),
      });
      await api.postInventoryMovement(created.data.id);
      if (invoiceFile) {
        try { await api.uploadInventoryAttachment(created.data.id, invoiceFile); }
        catch { /* no bloquear si falla el adjunto */ }
      }
      onCreated();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Error al guardar movimiento.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 999,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, width: '100%', maxWidth: 680,
        maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,.25)',
      }}>
        {/* Header modal */}
        <div style={{
          padding: '18px 20px', borderBottom: '1px solid #E6E4DE',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 800, color: '#111' }}>Registrar movimiento POP</h2>
            <p style={{ fontSize: 12, color: '#888', marginTop: 2 }}>Entrada o salida de material publicitario</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#888' }}>✕</button>
        </div>

        <div style={{ padding: 20, display: 'grid', gap: 16 }}>
          {/* Tipo */}
          <div>
            <label style={labelStyle}>Tipo de movimiento</label>
            <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
              {(['IN', 'OUT'] as const).map(t => (
                <button key={t} onClick={() => setMovType(t)} style={{
                  flex: 1, padding: '12px 0', border: `2px solid ${movType === t ? (t === 'IN' ? '#10B981' : '#E07B3A') : '#D8D6CE'}`,
                  borderRadius: 10, background: movType === t ? (t === 'IN' ? '#E6F7F1' : '#FFF0E8') : '#fff',
                  color: movType === t ? (t === 'IN' ? '#1D7A5A' : '#9A4A1A') : '#555',
                  fontWeight: 800, fontSize: 13, cursor: 'pointer',
                }}>
                  {t === 'IN' ? '↓ Entrada de material' : '↑ Salida / despacho'}
                </button>
              ))}
            </div>
            <p style={{ fontSize: 11, color: '#888', marginTop: 6 }}>
              {movType === 'IN'
                ? 'Recepción de material POP de proveedor o devolución de punto de venta.'
                : 'Despacho de material a campaña, evento o punto de venta.'}
            </p>
          </div>

          {/* Referencia */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Tipo de referencia</label>
              <select value={refType} onChange={e => setRefType(e.target.value)} style={{ ...selectStyle, width: '100%', marginTop: 4 }}>
                <option value="">Sin referencia</option>
                {REF_TYPES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>{refType === 'CAMPAÑA' ? 'Código de campaña' : refType === 'PDV' ? 'Nombre PDV' : 'Número / código'}</label>
              <input
                value={refNumber}
                onChange={e => setRefNumber(e.target.value)}
                placeholder={refType === 'CAMPAÑA' ? 'CAM-2025-01' : refType === 'PDV' ? 'PDV Norte' : 'Referencia...'}
                style={{ ...inputStyle, width: '100%', marginTop: 4 }}
              />
            </div>
          </div>

          {/* Notas */}
          <div>
            <label style={labelStyle}>Observaciones</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Descripción del movimiento..."
              rows={2}
              style={{ ...inputStyle, width: '100%', marginTop: 4, resize: 'vertical' }}
            />
          </div>

          {/* Líneas */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <label style={labelStyle}>Ítems de material POP</label>
              <button onClick={addLine} style={{ ...btnSecondary, fontSize: 12, padding: '5px 10px' }}>+ Agregar ítem</button>
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              {lines.map((line, idx) => (
                <div key={idx} style={{
                  display: 'grid', gap: 8,
                  gridTemplateColumns: movType === 'IN' ? '2fr 1fr 1fr auto' : '2fr 1fr auto',
                  alignItems: 'end',
                  background: '#FAFAF8', borderRadius: 10, padding: 12, border: '1px solid #E6E4DE',
                }}>
                  <div>
                    {idx === 0 && <label style={labelStyle}>Material POP</label>}
                    <select
                      value={line.item_id}
                      onChange={e => updateLine(idx, 'item_id', e.target.value)}
                      style={{ ...selectStyle, width: '100%', marginTop: idx === 0 ? 4 : 0 }}
                    >
                      <option value="">Seleccionar ítem...</option>
                      {items.map(i => (
                        <option key={i.id} value={i.id}>{i.sku} – {i.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    {idx === 0 && <label style={labelStyle}>Cantidad</label>}
                    <input
                      type="number" min="0" step="1"
                      value={line.quantity}
                      onChange={e => updateLine(idx, 'quantity', e.target.value)}
                      placeholder="0"
                      style={{ ...inputStyle, width: '100%', marginTop: idx === 0 ? 4 : 0 }}
                    />
                  </div>
                  {movType === 'IN' && (
                    <div>
                      {idx === 0 && <label style={labelStyle}>Costo unit. ($)</label>}
                      <input
                        type="number" min="0" step="0.01"
                        value={line.unit_cost}
                        onChange={e => updateLine(idx, 'unit_cost', e.target.value)}
                        placeholder="0.00"
                        style={{ ...inputStyle, width: '100%', marginTop: idx === 0 ? 4 : 0 }}
                      />
                    </div>
                  )}
                  <div style={{ paddingTop: idx === 0 ? 20 : 0 }}>
                    {lines.length > 1 && (
                      <button onClick={() => removeLine(idx)} style={{
                        background: 'none', border: '1px solid #F0997B', borderRadius: 6,
                        color: '#993C1D', cursor: 'pointer', padding: '6px 10px', fontSize: 13,
                      }}>✕</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {formError && (
            <div style={{ background: '#FFF2EC', border: '1px solid #F0997B', color: '#993C1D', borderRadius: 8, padding: '10px 14px', fontSize: 13 }}>
              {formError}
            </div>
          )}

          {/* Factura / comprobante */}
          {movType === 'IN' && (
            <div>
              <label style={labelStyle}>Factura o comprobante de compra (opcional)</label>
              <div style={{ marginTop: 6 }}>
                {invoiceFile ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#E6F7F1', border: '1px solid #B5E0D0', borderRadius: 8, padding: '8px 12px' }}>
                    <span style={{ fontSize: 18 }}>📄</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#085041', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{invoiceFile.name}</div>
                      <div style={{ fontSize: 11, color: '#0F6E56' }}>{(invoiceFile.size / 1024).toFixed(1)} KB</div>
                    </div>
                    <button onClick={() => setInvoiceFile(null)} style={{ background: 'none', border: 'none', color: '#993C1D', cursor: 'pointer', fontSize: 14 }}>✕</button>
                  </div>
                ) : (
                  <label style={{ display: 'block', border: '1.5px dashed #B5D4F4', borderRadius: 8, padding: '12px 16px', textAlign: 'center', cursor: 'pointer', background: '#F7FAFD' }}>
                    <span style={{ fontSize: 20 }}>📎</span>
                    <div style={{ fontSize: 12, color: '#5A90B2', marginTop: 4 }}>Adjuntar factura PDF, imagen o documento</div>
                    <input type="file" accept=".pdf,.jpg,.jpeg,.png,.xml" onChange={e => setInvoiceFile(e.target.files?.[0] ?? null)} style={{ display: 'none' }} />
                  </label>
                )}
              </div>
            </div>
          )}

          {/* Resumen */}
          {movType === 'IN' && lines.some(l => l.item_id && Number(l.quantity) > 0 && Number(l.unit_cost) > 0) && (
            <div style={{ background: '#E6F7F1', borderRadius: 10, padding: '10px 14px', border: '1px solid #B5E0D0' }}>
              <span style={{ fontSize: 12, color: '#1D7A5A', fontWeight: 700 }}>
                Total entrada: ${money(lines.reduce((s, l) => s + Number(l.quantity) * Number(l.unit_cost), 0))}
              </span>
            </div>
          )}
        </div>

        {/* Footer modal */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid #E6E4DE', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button onClick={onClose} style={btnSecondary}>Cancelar</button>
          <button onClick={handleSave} disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Guardando...' : `Registrar ${movType === 'IN' ? 'entrada' : 'salida'}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────
function EmptyState({ icon, title, subtitle }: { icon: string; title: string; subtitle: string }) {
  return (
    <div style={{
      background: '#fff', border: '1px solid #E6E4DE', borderRadius: 14,
      padding: 48, textAlign: 'center',
    }}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>{icon}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: '#333', marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 13, color: '#888' }}>{subtitle}</div>
    </div>
  );
}

// ─── Primitivos ───────────────────────────────────────────────────────────────
function Th({ children, align = 'left', colSpan }: { children?: React.ReactNode; align?: 'left' | 'right'; colSpan?: number }) {
  return (
    <th colSpan={colSpan} style={{ textAlign: align, padding: '10px 14px', fontSize: 11, color: '#666', fontWeight: 800, borderBottom: '1px solid #E6E4DE', textTransform: 'uppercase', letterSpacing: 0.4, whiteSpace: 'nowrap' }}>
      {children}
    </th>
  );
}

function Td({ children, align = 'left', bold, colSpan }: { children?: React.ReactNode; align?: 'left' | 'right'; bold?: boolean; colSpan?: number }) {
  return (
    <td colSpan={colSpan} style={{ textAlign: align, padding: '11px 14px', fontSize: 13, color: '#222', verticalAlign: 'middle', fontWeight: bold ? 700 : 400 }}>
      {children}
    </td>
  );
}

// ─── Iconos ───────────────────────────────────────────────────────────────────
function IconBox() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    </svg>
  );
}
function IconRefresh() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginRight: 4 }}>
      <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}
function IconDownload() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginRight: 4 }}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function num(v: number) {
  return Number(v ?? 0).toLocaleString('es-EC', { maximumFractionDigits: 2 });
}
function money(v: number) {
  return Number(v ?? 0).toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function fmtTime(s: string) {
  return new Date(s).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' });
}
function isExpiringSoon(d: string | null) {
  if (!d) return false;
  const diff = (new Date(d).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  return diff >= 0 && diff <= 30;
}
function isExpired(d: string | null) {
  if (!d) return false;
  return new Date(d).getTime() < Date.now();
}

async function getToken(): Promise<string> {
  const { msalInstance, loginRequest } = await import('../auth/msal');
  const account = msalInstance.getActiveAccount() ?? msalInstance.getAllAccounts()[0];
  if (!account) throw new Error('No autenticado');
  const result = await msalInstance.acquireTokenSilent({ ...loginRequest, account });
  return result.accessToken;
}

function downloadWithAuth(url: string, filename: string, token: string) {
  fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    .then(r => r.blob())
    .then(blob => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
    })
    .catch(console.error);
}

// ─── Estilos ──────────────────────────────────────────────────────────────────
const cardStyle: React.CSSProperties = {
  background: '#fff', border: '1px solid #E6E4DE', borderRadius: 14,
  overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,.04)',
};
const sectionTitle: React.CSSProperties = {
  fontSize: 15, fontWeight: 800, color: '#111', margin: 0,
};
const tableStyle: React.CSSProperties = {
  width: '100%', borderCollapse: 'collapse',
};
const inputStyle: React.CSSProperties = {
  border: '1px solid #D8D6CE', borderRadius: 8, padding: '8px 12px',
  fontSize: 13, color: '#222', outline: 'none', background: '#fff',
};
const selectStyle: React.CSSProperties = {
  border: '1px solid #D8D6CE', borderRadius: 8, padding: '8px 10px',
  fontSize: 13, color: '#222', outline: 'none', background: '#fff', cursor: 'pointer',
};
const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 800, color: '#666', textTransform: 'uppercase', letterSpacing: 0.5,
};
const btnPrimary: React.CSSProperties = {
  background: '#0284C7', color: '#fff', border: 'none', borderRadius: 9,
  padding: '10px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 6,
};
const btnSecondary: React.CSSProperties = {
  background: '#fff', color: '#333', border: '1px solid #D8D6CE', borderRadius: 9,
  padding: '9px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 4,
};

function tabBtn(active: boolean): React.CSSProperties {
  return {
    border: `1px solid ${active ? '#0284C7' : '#D8D6CE'}`,
    background: active ? '#0284C7' : '#fff',
    color: active ? '#fff' : '#555',
    borderRadius: 999, padding: '8px 16px', fontWeight: 700, cursor: 'pointer',
    fontSize: 13, display: 'inline-flex', alignItems: 'center',
  };
}

function pagerBtn(disabled: boolean): React.CSSProperties {
  return {
    border: '1px solid #D8D6CE', borderRadius: 6, padding: '6px 12px',
    fontSize: 14, cursor: disabled ? 'default' : 'pointer',
    background: '#fff', color: disabled ? '#ccc' : '#333', fontWeight: 600,
  };
}
