import { useEffect, useState } from 'react';
import { api, InventoryKardexRow, InventoryStockRow } from '../lib/api';

export default function Inventory() {
  const [stock, setStock] = useState<InventoryStockRow[]>([]);
  const [kardex, setKardex] = useState<InventoryKardexRow[]>([]);
  const [tab, setTab] = useState<'stock' | 'kardex'>('stock');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [stockRes, kardexRes] = await Promise.all([
        api.inventoryStock(),
        api.inventoryKardex(),
      ]);
      setStock(stockRes.data);
      setKardex(kardexRes.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar inventario.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div style={{ padding: 32, display: 'grid', gap: 20 }}>
      <div>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: '#111', marginBottom: 6 }}>
          Inventario
        </h1>
        <p style={{ color: '#666', fontSize: 14 }}>
          Stock multicentro, lotes y Kardex valorizado.
        </p>
      </div>

      {error && (
        <div style={{
          background: '#FFF2EC',
          border: '1px solid #F0997B',
          color: '#993C1D',
          borderRadius: 10,
          padding: 12,
          fontSize: 14,
          fontWeight: 700,
        }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={() => setTab('stock')} style={tabButton(tab === 'stock')}>
          Stock
        </button>
        <button onClick={() => setTab('kardex')} style={tabButton(tab === 'kardex')}>
          Kardex
        </button>
        <button onClick={load} style={tabButton(false)}>
          Refrescar
        </button>
      </div>

      {loading ? (
        <div style={{ color: '#777' }}>Cargando inventario...</div>
      ) : tab === 'stock' ? (
        <StockTable rows={stock} />
      ) : (
        <KardexTable rows={kardex} />
      )}
    </div>
  );
}

function StockTable({ rows }: { rows: InventoryStockRow[] }) {
  return (
    <div style={cardStyle}>
      <h2 style={sectionTitle}>Stock actual</h2>
      <table style={tableStyle}>
        <thead>
          <tr>
            <Th>Bodega</Th>
            <Th>Item</Th>
            <Th>Lote</Th>
            <Th align="right">Cantidad</Th>
            <Th align="right">Costo prom.</Th>
            <Th align="right">Valor</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => (
            <tr key={idx}>
              <Td>{r.location_id}</Td>
              <Td>{r.item_id}</Td>
              <Td>{r.lot_id ?? '-'}</Td>
              <Td align="right">{num(r.quantity_on_hand)}</Td>
              <Td align="right">{money(r.average_cost)}</Td>
              <Td align="right">{money(r.total_value)}</Td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <div style={{ padding: 18, color: '#777' }}>Sin stock registrado.</div>}
    </div>
  );
}

function KardexTable({ rows }: { rows: InventoryKardexRow[] }) {
  return (
    <div style={cardStyle}>
      <h2 style={sectionTitle}>Kardex</h2>
      <table style={tableStyle}>
        <thead>
          <tr>
            <Th>Fecha</Th>
            <Th>Mov.</Th>
            <Th>Tipo</Th>
            <Th>Bodega</Th>
            <Th>Lote</Th>
            <Th align="right">Entrada</Th>
            <Th align="right">Salida</Th>
            <Th align="right">Saldo</Th>
            <Th align="right">Valor saldo</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => (
            <tr key={idx}>
              <Td>{new Date(r.created_at).toLocaleString('es-EC')}</Td>
              <Td>{r.movement_number}</Td>
              <Td>{r.entry_type}</Td>
              <Td>{r.location_name || r.location_id}</Td>
              <Td>{r.lot_code || r.lot_id || '-'}</Td>
              <Td align="right">{num(r.quantity_in)}</Td>
              <Td align="right">{num(r.quantity_out)}</Td>
              <Td align="right">{num(r.balance_quantity)}</Td>
              <Td align="right">{money(r.balance_total_value)}</Td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <div style={{ padding: 18, color: '#777' }}>Sin movimientos en Kardex.</div>}
    </div>
  );
}

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th style={{
      textAlign: align,
      padding: '12px 14px',
      fontSize: 12,
      color: '#666',
      borderBottom: '1px solid #E6E4DE',
      background: '#FAFAF8',
    }}>
      {children}
    </th>
  );
}

function Td({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <td style={{
      textAlign: align,
      padding: '12px 14px',
      fontSize: 13,
      color: '#222',
      borderBottom: '1px solid #F0EFEA',
      verticalAlign: 'top',
    }}>
      {children}
    </td>
  );
}

function tabButton(active: boolean): React.CSSProperties {
  return {
    border: '1px solid #D8D6CE',
    background: active ? '#185FA5' : '#fff',
    color: active ? '#fff' : '#333',
    borderRadius: 999,
    padding: '9px 15px',
    fontWeight: 800,
    cursor: 'pointer',
  };
}

const cardStyle: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #E6E4DE',
  borderRadius: 16,
  overflow: 'hidden',
  boxShadow: '0 8px 24px rgba(0,0,0,.05)',
};

const sectionTitle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 800,
  padding: 18,
  borderBottom: '1px solid #ECECEA',
};

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
};

function num(v: number) {
  return Number(v ?? 0).toLocaleString('es-EC', { maximumFractionDigits: 2 });
}

function money(v: number) {
  return Number(v ?? 0).toLocaleString('es-EC', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
