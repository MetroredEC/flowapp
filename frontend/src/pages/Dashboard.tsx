import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMsal } from '@azure/msal-react';
import { api, Stats, Request } from '../lib/api';
import { Card, PageHeader, StatusBadge, Spinner } from '../components/ui';

export default function Dashboard() {
  const { accounts } = useMsal();
  const name = accounts[0]?.name?.split(' ')[0] ?? '';
  const navigate = useNavigate();
  const [stats, setStats]     = useState<Stats | null>(null);
  const [recent, setRecent]   = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.getStats().then(r => setStats(r.data)),
      api.getRequests({} as never).then(r => setRecent(r.data.slice(0, 5))),
    ]).finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
      <Spinner size={32} />
    </div>
  );

  const statusLabels: Record<string, string> = {
    pending: 'Pendientes', in_progress: 'En proceso',
    approved: 'Aprobadas', rejected: 'Rechazadas',
  };

  return (
    <div style={{ padding: 32, maxWidth: 1100, margin: '0 auto' }}>
      <PageHeader
        title={`Hola, ${name} °˜¹`}
        subtitle="Resumen de solicitudes activas"
        action={
          <button onClick={() => navigate('/requests/new')} style={{
            background: '#0C447C', color: '#fff', border: 'none', borderRadius: 8,
            padding: '10px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}>+ Nueva solicitud</button>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
        {(stats?.byStatus ?? []).map(s => (
          <Card key={s.status} style={{ padding: '20px 24px' }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#111', marginBottom: 4 }}>
              {s.count}
            </div>
            <div style={{ fontSize: 13, color: '#888' }}>{statusLabels[s.status] ?? s.status}</div>
          </Card>
        ))}
        {!stats?.byStatus.length && (
          <Card style={{ gridColumn: '1/-1', textAlign: 'center', color: '#aaa', padding: 32 }}>
            Sin solicitudes aºn
          </Card>
        )}
      </div>

      {(stats?.byType?.length ?? 0) > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Card>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#333', marginBottom: 16 }}>Por tipo</h3>
            {stats!.byType.map(t => (
              <div key={t.request_type_name} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '8px 0', borderBottom: '1px solid #F2F2F0',
              }}>
                <span style={{ fontSize: 13, color: '#444' }}>{t.request_type_name}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#0C447C' }}>{t.count}</span>
              </div>
            ))}
          </Card>

          <Card>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#333', marginBottom: 16 }}>
              Solicitudes recientes
            </h3>
            {recent.map(r => (
              <div key={r.id} onClick={() => navigate(`/requests/${r.id}`)}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '10px 0', borderBottom: '1px solid #F2F2F0', cursor: 'pointer' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#111',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.title}
                  </div>
                  <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>
                    {r.request_type_name} · {new Date(r.created_at).toLocaleDateString('es-EC')}
                  </div>
                </div>
                <StatusBadge status={r.status} />
              </div>
            ))}
            {!recent.length && <p style={{ fontSize: 13, color: '#aaa' }}>Sin solicitudes</p>}
          </Card>
        </div>
      )}
    </div>
  );
}
