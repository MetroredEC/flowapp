export function formatStatusLabel(value: unknown): string {
  const status = String(value ?? '').trim().toLowerCase();

  const labels: Record<string, string> = {
    draft: 'Borrador',
    pending: 'Pendiente',
    in_progress: 'En proceso',
    approved: 'Aprobada',
    rejected: 'Rechazada',
    completed: 'Completada',
    cancelled: 'Cancelada',
    deployed: 'Publicado',
    analyzed: 'En edicion',
    posted: 'Registrado',
    open: 'Abierta',
    closed: 'Cerrada',
    active: 'Activo',
    inactive: 'Inactivo',
  };

  return labels[status] || String(value ?? 'Sin estado');
}
