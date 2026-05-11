import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, Request } from '../lib/api';
import { PageHeader, StatusBadge, Spinner, Empty, Input, Select, LevelStepper } from '../components/ui';

export default function RequestList() {
 const navigate = useNavigate();
 const [requests, setRequests] = useState<Request[]>([]);
 const [loading, setLoading]  = useState(true);
 const [q, setQ]        = useState('');
 const [status, setStatus]   = useState('');

 const load = () => {
  setLoading(true);
  const params: Record<string, string> = {};
  if (q)   params.q = q;
  if (status) params.status = status;
  api.getRequests(params)
  .then(r => setRequests(r.data))
  .finally(() => setLoading(false));
 };

 useEffect(() => { load(); }, [status]);

 return (
  <div style={{ padding: 32, maxWidth: 1000, margin: '0 auto' }}>
   <PageHeader
    title="Solicitudes"
    subtitle="Todas tus solicitudes y su estado de aprobaci³n"
    action={
     <button onClick={() => navigate('/requests/new')} style={{
      background: '#0C447C', color: '#fff', border: 'none', borderRadius: 8,
      padding: '10px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
     }}>+ Nueva</button>
    }
   />

   <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
    <Input
     placeholder="Buscar por t­tulo..."
     value={q}
     onChange={e => setQ(e.target.value)}
     onKeyDown={e => e.key === 'Enter' && load()}
     style={{ maxWidth: 280 }}
    />
    <Select value={status} onChange={e => setStatus(e.target.value)} style={{ maxWidth: 180 }}>
     <option value="">Todos los estados</option>
     <option value="in_progress">En proceso</option>
     <option value="approved">Aprobadas</option>
     <option value="rejected">Rechazadas</option>
     <option value="cancelled">Canceladas</option>
    </Select>
   </div>

   {loading ? (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
     <Spinner size={28} />
    </div>
   ): requests.length === 0 ? (
    <Empty message="No se encontraron solicitudes" />
   ): (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
     {requests.map(r => (
      <div
       key={r.id}
       onClick={() => navigate(`/requests/${r.id}`)}
       style={{
        background: '#fff', borderRadius: 12, padding: '16px 20px',
        border: '1px solid #E8E8E4', cursor: 'pointer',
        transition: 'border-color.15s',
       }}
       onMouseEnter={e => (e.currentTarget.style.borderColor = '#B5D4F4')}
       onMouseLeave={e => (e.currentTarget.style.borderColor = '#E8E8E4')}
      >
       <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
         <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#111',
           overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
           {r.title}
          </span>
          <StatusBadge status={r.status} />
         </div>
         <div style={{ fontSize: 12, color: '#888' }}>
          {r.request_type_name} · {r.requester_name} ·{' '}
          {new Date(r.created_at).toLocaleDateString('es-EC', {
           day: 'numeric', month: 'short', year: 'numeric'
          })}
          {r.attachment_count > 0 && (
           <span style={{ marginLeft: 8 }}>°½ {r.attachment_count}</span>
          )}
         </div>
        </div>
        <LevelStepper
         current={r.current_level}
         total={r.total_levels}
         steps={r.steps?.map(s => ({
          level: s.level,
          approver_name: s.approver_name,
          status: s.status,
         }))}
        />
       </div>
      </div>
     ))}
    </div>
   )}
  </div>
 );
}
