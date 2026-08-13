import { msalInstance, loginRequest } from '../auth/msal';

const BASE = String(import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

async function getToken(): Promise<string> {
  const account = msalInstance.getActiveAccount() ?? msalInstance.getAllAccounts()[0];
  if (!account) throw new Error('No autenticado');
  const result = await msalInstance.acquireTokenSilent({ ...loginRequest, account });
  return result.accessToken;
}

async function request<T>(
  method: string, path: string, body?: unknown, isFormData = false
): Promise<T> {
  if (!BASE) throw new Error('VITE_API_URL no esta configurado');
  const token = await getToken();
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (body && !isFormData) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: isFormData ? (body as FormData) : body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText })) as { message?: string; error?: string; trace_id?: string };
    const trace = res.headers.get('X-Trace-Id') || err.trace_id;
    const message = err.message ?? err.error ?? `Error ${res.status}`;
    throw new Error(trace ? `${message} (Referencia: ${trace})` : message);
  }
  return res.json() as Promise<T>;
}


export interface BpmTask {
  id: string;
  title: string;
  status: string;
  assignee_email: string | null;
  created_at: string;
  completed_at: string | null;
  request_id: string | null;
  request_title: string | null;
  request_type_name: string | null;
  requester_name: string | null;
}

export interface BpmTaskDetail {
  task: Record<string, unknown>;
  attachments: Record<string, unknown>[];
  events: Record<string, unknown>[];
}

export interface InventoryLocation {
  id: string;
  code: string;
  name: string;
  description?: string;
  is_active: number;
}

export interface InventoryStockRow {
  location_id: string;
  location_name: string;
  item_id: string;
  sku: string;
  item_name: string;
  unit: string;
  lot_id: string | null;
  lot_code: string;
  expiration_date: string | null;
  quantity_on_hand: number;
  average_cost: number;
  total_value: number;
}

export interface InventoryKardexRow {
  id: string;
  created_at: string;
  entry_type: string;
  location_id: string;
  location_name: string;
  item_id: string;
  sku: string;
  item_name: string;
  unit: string;
  lot_id: string | null;
  lot_code: string;
  expiration_date: string | null;
  quantity_in: number;
  quantity_out: number;
  unit_cost: number;
  total_cost: number;
  balance_quantity: number;
  balance_unit_cost: number;
  balance_total_value: number;
  movement_number: string;
  movement_type: string;
  reference_type: string | null;
  reference_number: string | null;
  movement_notes: string | null;
  created_by_name: string | null;
}

export interface KardexFilters {
  item_id?: string;
  location_id?: string;
  entry_type?: string;
  from_date?: string;
  to_date?: string;
  movement_number?: string;
  q?: string;
  limit?: number;
  offset?: number;
}

export interface InventoryDashboard {
  total_units: number;
  total_value: number;
  expired_lots: number;
  expiring_lots_30d: number;
  critical_items: number;
}

export interface InventoryItemCatalog {
  id: string;
  sku: string;
  name: string;
  unit: string;
}

export const api = {
  inventoryLocations: () =>
    request<{ data: InventoryLocation[] }>('GET', '/api/inventory/locations'),

  inventoryItems: (q = '') =>
    request<{ data: InventoryItemCatalog[] }>('GET', '/api/inventory/items?q=' + encodeURIComponent(q)),

  createSupplyRequest: (body: {
    center_location_id: string;
    justification?: string;
    required_date?: string | null;
    lines: {
      item_id: string;
      quantity_requested: number;
      notes?: string;
    }[];
  }) =>
    request<{ data: { id: string; request_number: string; status: string } }>('POST', '/api/supply-requests', body),

  inventoryDashboard: () =>
    request<{ data: InventoryDashboard }>('GET', '/api/inventory/dashboard'),

  inventoryStock: (params?: { location_id?: string; item_id?: string; q?: string }) => {
    const qs = new URLSearchParams();
    if (params?.location_id) qs.set('location_id', params.location_id);
    if (params?.item_id) qs.set('item_id', params.item_id);
    if (params?.q) qs.set('q', params.q);
    return request<{ data: InventoryStockRow[] }>('GET', '/api/inventory/stock?' + qs.toString());
  },

  inventoryKardex: (filters?: KardexFilters) => {
    const qs = new URLSearchParams();
    if (filters?.item_id) qs.set('item_id', filters.item_id);
    if (filters?.location_id) qs.set('location_id', filters.location_id);
    if (filters?.entry_type) qs.set('entry_type', filters.entry_type);
    if (filters?.from_date) qs.set('from_date', filters.from_date);
    if (filters?.to_date) qs.set('to_date', filters.to_date);
    if (filters?.movement_number) qs.set('movement_number', filters.movement_number);
    if (filters?.q) qs.set('q', filters.q);
    if (filters?.limit) qs.set('limit', String(filters.limit));
    if (filters?.offset) qs.set('offset', String(filters.offset));
    return request<{ data: InventoryKardexRow[]; total: number; limit: number; offset: number }>(
      'GET', '/api/inventory/kardex?' + qs.toString()
    );
  },

  exportInventoryStock: (location_id?: string) => {
    const qs = location_id ? `?location_id=${encodeURIComponent(location_id)}` : '';
    return `${String(import.meta.env.VITE_API_URL || '').replace(/\/+$/, '')}/api/inventory/export/stock${qs}`;
  },

  exportInventoryKardex: (location_id?: string) => {
    const qs = location_id ? `?location_id=${encodeURIComponent(location_id)}` : '';
    return `${String(import.meta.env.VITE_API_URL || '').replace(/\/+$/, '')}/api/inventory/export/kardex${qs}`;
  },

  createInventoryMovement: (body: {
    movement_type: 'IN' | 'OUT' | 'TRANSFER';
    source_location_id?: string | null;
    target_location_id?: string | null;
    reference_type?: string;
    reference_number?: string;
    notes?: string;
    lines: {
      item_id: string;
      lot_id?: string | null;
      quantity: number;
      unit_cost?: number;
      total_cost?: number;
      notes?: string;
    }[];
  }) =>
    request<{ data: { id: string; movement_number: string } }>('POST', '/api/inventory/movements', body),

  postInventoryMovement: (id: string) =>
    request<{ data: { posted: boolean; movementId: string } }>('POST', '/api/inventory/movements/' + id + '/post'),

  uploadInventoryAttachment: (movementId: string, file: File) => {
    const fd = new FormData(); fd.append('file', file);
    return request<{ data: { id: string; filename: string; r2_key: string } }>(
      'POST', '/api/inventory/movements/' + movementId + '/attachments', fd, true
    );
  },

  bpmTasksMine: (all = false) =>
    request<{ data: BpmTask[] }>('GET', '/api/bpm-tasks/mine' + (all ? '?all=1' : '')),

  bpmTaskDetail: (id: string) => request<{ data: BpmTaskDetail }>('GET', '/api/bpm-tasks/' + id),

  completeBpmTask: (id: string, body: { action: 'approve' | 'reject' | 'complete'; comment?: string }) => request<{ data: { completed: boolean; nextNodeId?: string | null } }>('POST', '/api/bpm-tasks/' + id + '/complete', body),

  // Requests
  getRequests: (params?: Record<string, string>) =>
    request<{ data: Request[] }>('GET', `/api/requests?${new URLSearchParams(params)}`),
  getRequest: (id: string) =>
    request<{ data: RequestDetail }>('GET', `/api/requests/${id}`),
  createRequest: (body: CreateRequestBody) =>
    request<{ data: { id: string } }>('POST', '/api/requests', body),
  submitRequest: (id: string) =>
    request<{ data: { submitted: boolean } }>('PATCH', `/api/requests/${id}/submit`),
  cancelRequest: (id: string) =>
    request<{ data: unknown }>('PATCH', `/api/requests/${id}/cancel`),
  uploadFile: (requestId: string, file: File) => {
    const fd = new FormData(); fd.append('file', file);
    return request<{ data: { id: string; filename: string; size_bytes: number } }>(
      'POST', `/api/requests/${requestId}/attachments`, fd, true
    );
  },

  // Admin
  getRequestTypes: () =>
    request<{ data: RequestType[] }>('GET', '/api/admin/request-types'),
  createRequestType: (body: { name: string; description?: string }) =>
    request<{ data: { id: string } }>('POST', '/api/admin/request-types', body),
  updateRequestType: (id: string, body: Partial<RequestType>) =>
    request<{ data: unknown }>('PATCH', `/api/admin/request-types/${id}`, body),
  getFlow: (typeId: string) =>
    request<{ data: FlowConfig[] }>('GET', `/api/admin/flows/${typeId}`),
  saveFlow: (typeId: string, levels: FlowLevel[]) =>
    request<{ data: unknown }>('PUT', `/api/admin/flows/${typeId}`, levels),
  searchUsers: (q: string) =>
    request<{ data: EntraUser[] }>('GET', `/api/admin/users/search?q=${encodeURIComponent(q)}`),
  getStats: () =>
    request<{ data: Stats }>('GET', '/api/admin/stats'),
  saveCampaignCost: (body: CampaignCostBody) =>
    request<{ data: { id: string } }>('POST', '/api/admin/campaign-costs', body),

  // Form Fields (solicitud / intake)
  getFormFields: (typeId: string) =>
    request<{ data: FormField[] }>('GET', `/api/admin/form-fields/${typeId}`),

  saveFormFields: (typeId: string, fields: FormFieldInput[]) =>
    request<{ data: { saved: number } }>('PUT', `/api/admin/form-fields/${typeId}`, fields),

  // Process Config (wizard)
  getProcessConfig: (typeId: string) =>
    request<{ data: ProcessConfig | null }>('GET', `/api/admin/process-config/${typeId}`),
  saveProcessConfig: (typeId: string, config: Partial<ProcessConfig>) =>
    request<{ data: ProcessConfig }>('PUT', `/api/admin/process-config/${typeId}`, config),

  // Close Form Fields (cierre de proceso)
  getCloseFormFields: (typeId: string) =>
    request<{ data: FormField[] }>('GET', `/api/admin/close-fields/${typeId}`),

  saveCloseFormFields: (typeId: string, fields: FormFieldInput[]) =>
    request<{ data: { saved: number } }>('PUT', `/api/admin/close-fields/${typeId}`, fields),

  // Request close form (solicitudes)
  getRequestCloseForm: (requestId: string) =>
    request<{ data: { fields: FormField[]; closure: RequestClosure | null } }>('GET', `/api/requests/${requestId}/close-form`),

  submitRequestClose: (requestId: string, formData: Record<string, unknown>) =>
    request<{ data: { closed: boolean } }>('POST', `/api/requests/${requestId}/close`, { form_data: formData }),

  // Tickets
  getTickets: (dept?: TicketDept) => {
    const qs = dept ? `?dept=${dept}` : '';
    return request<{ data: Ticket[] }>('GET', `/api/tickets${qs}`);
  },
  createTicket: (body: CreateTicketBody) =>
    request<{ data: Ticket }>('POST', '/api/tickets', body),
  updateTicket: (id: string, patch: Partial<Ticket>) =>
    request<{ data: Ticket }>('PATCH', `/api/tickets/${id}`, patch),
  deleteTicket: (id: string) =>
    request<{ data: { deleted: boolean } }>('DELETE', `/api/tickets/${id}`),
  getTeamMembers: (dept: TicketDept) =>
    request<{ data: TeamMember[] }>('GET', `/api/tickets/team/${dept}`),
  addTeamMember: (body: { user_id: string; user_name: string; user_email: string; department: TicketDept }) =>
    request<{ data: { id: string } }>('POST', '/api/tickets/team', body),
  removeTeamMember: (id: string) =>
    request<{ data: { removed: boolean } }>('DELETE', `/api/tickets/team/${id}`),

  // Process Builder
  getProcesses: () =>
    request<{ data: ProcessWithFlow[] }>('GET', '/api/admin/processes'),

  createProcess: (body: CreateProcessBody) =>
    request<{ data: { id: string; name: string } }>('POST', '/api/admin/processes', body),

  saveFullProcess: (body: FullProcessBody) =>
    request<{ data: { id: string; name: string; edited: boolean } }>('POST', '/api/admin/processes/full', body),

  deleteProcess: (id: string) =>
    request<{ data: { deleted: boolean; archived: boolean; request_count: number; message: string } }>('DELETE', `/api/admin/processes/${id}`),

  updateProcess: (id: string, body: { name?: string; description?: string; is_active?: number }) =>
    request<{ data: RequestType }>('PATCH', `/api/admin/processes/${id}`, body),

  // SSO Sales
  getSSOSales: (filters?: { estado?: string; search?: string }) => {
    const qs = new URLSearchParams();
    if (filters?.estado) qs.set('estado', filters.estado);
    if (filters?.search) qs.set('search', filters.search);
    return request<{ data: SSOSale[] }>('GET', '/api/sso/sales' + (qs.toString() ? '?' + qs.toString() : ''));
  },

  getSSOSale: (id: string) =>
    request<{ data: SSOSale | null }>('GET', `/api/sso/sales/${id}`),

  createSSOSale: (body: Partial<SSOSale>) =>
    request<{ data: SSOSale }>('POST', '/api/sso/sales', body),

  updateSSOSale: (id: string, body: Partial<SSOSale>) =>
    request<{ data: SSOSale }>('PATCH', `/api/sso/sales/${id}`, body),

  deleteSSOSale: (id: string) =>
    request<{ data: { success: boolean } }>('DELETE', `/api/sso/sales/${id}`),

  getSSOActivities: (saleId: string) =>
    request<{ data: SSOActivity[] }>('GET', `/api/sso/sales/${saleId}/activities`),

  addSSOActivity: (saleId: string, body: { type?: string; body: string; proxima_accion?: string; proxima_accion_fecha?: string }) =>
    request<{ data: SSOActivity }>('POST', `/api/sso/sales/${saleId}/activities`, body),

  getSSOStats: () =>
    request<{ data: { totalPipeline: number; totalGanado: number; totalSales: number; closedWon: number; conversionRate: number; byStage: any[] } }>(
      'GET', '/api/sso/stats'
    ),

  // ─── WORKSPACE (Espacios · Tareas · Bandeja) ───────────────────────────────
  getSpaces: () =>
    request<{ data: Space[] }>('GET', '/api/workspace/spaces'),

  getSpaceCounts: () =>
    request<{ data: { space_id: string; total: number; mine: number }[] }>('GET', '/api/workspace/spaces/counts'),

  getTasks: (filters?: { space?: string; assignee?: string; search?: string; source?: string }) => {
    const qs = new URLSearchParams();
    if (filters?.space)    qs.set('space', filters.space);
    if (filters?.assignee) qs.set('assignee', filters.assignee);
    if (filters?.search)   qs.set('search', filters.search);
    if (filters?.source)   qs.set('source', filters.source);
    return request<{ data: Task[] }>('GET', '/api/workspace/tasks' + (qs.toString() ? '?' + qs.toString() : ''));
  },

  getMyTasks: () =>
    request<{ data: Task[] }>('GET', '/api/workspace/tasks/mine'),

  getMyDay: () =>
    request<{ data: WorkDay }>('GET', '/api/workspace/day'),

  getTask: (id: string) =>
    request<{ data: { task: Task; comments: TaskComment[]; activity: TaskActivity[]; checklist: TaskChecklistItem[]; deliverables: TaskDeliverable[] } }>('GET', `/api/workspace/tasks/${id}`),

  createTask: (body: Partial<Task>) =>
    request<{ data: Task }>('POST', '/api/workspace/tasks', body),

  updateTask: (id: string, body: Partial<Task>) =>
    request<{ data: Task }>('PATCH', `/api/workspace/tasks/${id}`, body),

  deleteTask: (id: string) =>
    request<{ data: { archived: boolean } }>('DELETE', `/api/workspace/tasks/${id}`),

  addComment: (taskId: string, body: string, mentions?: string[]) =>
    request<{ data: TaskComment }>('POST', `/api/workspace/tasks/${taskId}/comments`, { body, mentions }),

  updateChecklistItem: (taskId: string, itemId: string, is_done: boolean) =>
    request<{ data: TaskChecklistItem }>('PATCH', `/api/workspace/tasks/${taskId}/checklist/${itemId}`, { is_done }),

  updateDeliverable: (taskId: string, itemId: string, body: { is_completed: boolean; evidence_url?: string }) =>
    request<{ data: TaskDeliverable }>('PATCH', `/api/workspace/tasks/${taskId}/deliverables/${itemId}`, body),

  getInbox: () =>
    request<{ data: Notification[]; unread: number }>('GET', '/api/workspace/inbox'),

  getInboxCount: () =>
    request<{ unread: number }>('GET', '/api/workspace/inbox/count'),

  markRead: (opts: { id?: string; all?: boolean }) =>
    request<{ data: { ok: boolean } }>('POST', '/api/workspace/inbox/read', opts),

  getOverview: () =>
    request<{ data: WorkspaceOverview }>('GET', '/api/workspace/overview'),

  getMetrics: () =>
    request<{ data: ManagementMetrics }>('GET', '/api/workspace/metrics'),

  getSysLogs: (opts?: { category?: string; errors?: boolean; trace?: string; q?: string }) => {
    const qs = new URLSearchParams();
    if (opts?.category) qs.set('category', opts.category);
    if (opts?.errors) qs.set('errors', '1');
    if (opts?.trace) qs.set('trace', opts.trace);
    if (opts?.q) qs.set('q', opts.q);
    return request<{ data: SysEvent[] }>('GET', '/api/admin/logs' + (qs.toString() ? '?' + qs.toString() : ''));
  },

  runDiagnostics: () =>
    request<{ data: DiagnosticRun }>('POST', '/api/admin/diagnostics/run'),

  getDiagnosticRuns: () =>
    request<{ data: DiagnosticRunRow[] }>('GET', '/api/admin/diagnostics/runs'),

  getMyApprovals: () =>
    request<{ data: PendingApproval[] }>('GET', '/api/workspace/approvals/mine'),

  decideApproval: (stepId: string, action: 'approve' | 'reject', comment?: string) =>
    request<{ data: { done: boolean; nextLevel?: number } }>('POST', `/api/workspace/approvals/${stepId}/decide`, { action, comment }),

};

export interface PendingApproval {
  step_id: string; level: number; label: string;
  request_id: string; title: string; request_type_name: string;
  requester_name: string; requester_email: string;
  total_levels: number; created_at: string;
}

// ─── Workspace types ──────────────────────────────────────────────────────────
export interface SpaceStatus {
  id: string; space_id: string; key: string; label: string;
  color: string; sort_order: number; is_done: number;
}
export interface Space {
  id: string; name: string; color: string; icon: string;
  sort_order: number; is_active: number; statuses: SpaceStatus[];
}
export interface Task {
  id: string; space_id: string; title: string; description: string | null;
  status: string; priority: 'low' | 'normal' | 'high' | 'urgent';
  assignee_id: string | null; assignee_name: string | null; assignee_email: string | null;
  created_by_id: string | null; created_by_name: string | null; created_by_email: string | null;
  due_date: string | null; source_type: string; source_id: string | null;
  custom_fields_json: string | null;
  needs_approval: number; approval_status: string | null;
  approver_email: string | null; approver_name: string | null;
  archived: number; created_at: string; updated_at: string;
  started_at?: string | null; completed_at?: string | null;
  planned_date?: string | null; day_order?: number | null; snoozed_until?: string | null;
  is_blocked?: number; blocked_reason?: string | null; estimate_minutes?: number | null;
  space_name?: string; space_color?: string;
}
export interface WorkDay {
  planned: Task[];
  suggested: Task[];
  summary: {
    open: number; overdue: number; blocked: number; planned: number;
    completed_today: number; planned_minutes: number;
  };
}
export interface TaskComment {
  id: string; task_id: string; author_id: string | null;
  author_name: string; author_email: string; body: string;
  mentions_json: string | null; created_at: string;
}
export interface TaskActivity {
  id: string; task_id: string; actor_id: string | null; actor_name: string;
  actor_email: string | null; action: string; meta_json: string | null; created_at: string;
  task_title?: string; space_id?: string;
}
export interface TaskChecklistItem {
  id: string; task_id: string; label: string; is_required: number; is_done: number;
  sort_order: number; completed_by: string | null; completed_at: string | null;
}
export interface TaskDeliverable {
  id: string; task_id: string; label: string; is_required: number; is_completed: number;
  evidence_url: string | null; sort_order: number; completed_by: string | null; completed_at: string | null;
}
export interface Notification {
  id: string; user_email: string; type: string;
  task_id: string | null; task_title: string | null; space_id: string | null;
  actor_name: string | null; body: string | null; is_read: number; created_at: string;
}
export interface WorkspaceOverview {
  mine: { total: number; open: number; done: number; urgent: number; overdue: number };
  bySpace: { id: string; name: string; color: string; total: number; open: number }[];
  recent: TaskActivity[];
}

export interface SysEvent {
  id: string; at: string; category: string; action: string; ok: number;
  ref_type: string | null; ref_id: string | null; actor: string | null; detail: string | null;
  severity: 'debug' | 'info' | 'warn' | 'error'; trace_id: string | null; source: string | null;
  duration_ms: number | null; http_status: number | null;
}

export interface DiagnosticCheck {
  name: string; label: string; ok: boolean; duration_ms: number; detail: string;
}

export interface DiagnosticRun {
  run_id: string; status: 'passed' | 'partial' | 'failed'; passed: number; total: number;
  checks: DiagnosticCheck[];
}

export interface DiagnosticRunRow {
  id: string; started_at: string; completed_at: string | null; status: string;
  initiated_by: string | null; summary_json: string | null;
}

export interface ManagementMetrics {
  bySpace: { id: string; name: string; color: string; open: number; done30: number; cycle_days: number | null }[];
  slaByPriority: { priority: string; done30: number; within: number }[];
  aged: { id: string; title: string; space_id: string; space_name: string; space_color: string; assignee_name: string | null; priority: string; stale_days: number }[];
  agedCount: number;
  approvers: { name: string; email: string; pending: number; decided: number; avg_hours: number | null }[];
  requests: { created30: number; approved30: number; rejected30: number; inflight: number };
}

export interface SSOSale {
  id: string;
  empresa: string;
  contacto_nombre: string;
  contacto_correo: string;
  contacto_telefono: string;
  monto_venta: number;
  numero_contrato: string | null;
  numero_cotizacion: string | null;
  servicio_contratado: string | null;
  fecha_inicio: string | null;
  estado: 'prospecto' | 'negociacion' | 'propuesta' | 'cerrado_ganado' | 'cerrado_perdido';
  probabilidad: number;
  observaciones: string | null;
  origen: string | null;
  proxima_accion: string | null;
  proxima_accion_fecha: string | null;
  created_at: string;
  updated_at: string;
}

export interface SSOActivity {
  id: string; sale_id: string; type: string; body: string;
  author_name: string | null; author_email: string | null; created_at: string;
}

// Types
export interface Request {
  id: string; title: string; description: string;
  request_type_id: string; request_type_name: string;
  requester_name: string; requester_email: string;
  status: string; current_level: number; total_levels: number;
  created_at: string; updated_at: string;
  attachment_count: number;
  process_version_id?: string | null; process_version?: number | null;
  submitted_at?: string | null; approved_at?: string | null; rejected_at?: string | null;
  cancelled_at?: string | null; closed_at?: string | null; sla_due_at?: string | null;
  steps?: ApprovalStep[];
}
export interface RequestClosure {
  id: string;
  request_id: string;
  closed_by_id: string;
  closed_by_name: string;
  closed_at: string;
  form_data_json: string;
}

export interface RequestDetail extends Request {
  attachments: Attachment[];
  campaign_cost: CampaignCost | null;
  closure: RequestClosure | null;
  linked_task: LinkedRequestTask | null;
  timeline: WorkEvent[];
}
export interface LinkedRequestTask {
  id: string; space_id: string; status: string; assignee_name: string | null;
  assignee_email: string | null; due_date: string | null;
}
export interface WorkEvent {
  id: string; request_id: string; task_id: string | null; event_type: string; title: string;
  actor_id: string | null; actor_name: string | null; actor_email: string | null;
  detail_json: string | null; detail: Record<string, unknown> | null; created_at: string;
}
export interface ApprovalStep {
  id: string; level: number; label: string;
  approver_name: string; approver_email: string;
  status: string; comment: string | null; decided_at: string | null;
}
export interface Attachment {
  id: string; filename: string; r2_key: string; content_type: string;
  size_bytes: number; is_selected: number; created_at: string;
}
export interface RequestType {
  id: string; name: string; description: string | null; is_active: number;
}
export interface FlowConfig {
  id: string; level: number; label: string;
  approver_type: 'fixed_user' | 'job_title';
  approver_value: string; approver_name: string | null; approver_email: string | null;
}
export interface FlowLevel {
  level: number; label: string;
  approver_type: 'fixed_user' | 'job_title';
  approver_value: string; approver_name?: string; approver_email?: string;
}
export interface EntraUser {
  id: string; name: string; email: string; jobTitle: string; department: string;
}
export interface Stats {
  totals: { total: number } | null;
  byStatus: { status: string; count: number }[];
  byType: { request_type_name: string; count: number }[];
}
export interface CampaignCost {
  id: string; campaign_code: string; total_amount: number; currency: string;
  execution_date: string; billing_date: string; notes: string | null;
  vendors: CampaignVendor[];
}
export interface CampaignVendor {
  vendor_name: string; amount: number; is_selected: number;
}
export interface CreateRequestBody {
  request_type_id: string; title: string; description: string; campaign_data?: unknown;
}
// ─── Form Fields ─────────────────────────────────────────────────────────────
export type FormFieldType =
  | 'text' | 'email' | 'textarea' | 'number' | 'date'
  | 'select' | 'checkbox' | 'radio' | 'checkbox_group' | 'file' | 'section';

// ─── Process Config (wizard) ─────────────────────────────────────────────────
export interface WizardField {
  id: string;
  type: FormFieldType;
  label: string;
  placeholder?: string;
  required: boolean;
  options?: string[];        // for radio, checkbox_group, select
  description?: string;      // for section
  accept?: string;           // for file
  maxFiles?: number;
}

export interface ProcessConfig {
  id: string;
  form_schema_json: string;
  close_schema_json: string;
  email_subject: string | null;
  email_body: string | null;
  send_on_approve: number;
  color: string;
  icon: string;
  category: string | null;
  default_sla_days: number;
  workspace_id: string | null;
  assignment_mode: 'auto_load' | 'manual' | 'fixed_user';
  fixed_assignee_id: string | null;
  fixed_assignee_name: string | null;
  fixed_assignee_email: string | null;
  execution_sla_days: number | null;
  checklist_json: string;
  deliverables_json: string;
  require_requester_confirmation: number;
  created_at: string;
  updated_at: string;
}

export interface FormField {
  id: string;
  request_type_id: string;
  field_key: string;
  label: string;
  field_type: FormFieldType;
  placeholder: string | null;
  required: number;
  options_json: string | null;
  sort_order: number;
}

export interface FormFieldInput {
  field_key: string;
  label: string;
  field_type: FormFieldType;
  placeholder?: string;
  required?: number;
  options_json?: string;
  sort_order?: number;
}

// ─── Process Builder ─────────────────────────────────────────────────────────
export interface ProcessLevel {
  id: string;
  request_type_id: string;
  level: number;
  label: string;
  approver_type: 'fixed_user' | 'job_title';
  approver_value: string;
  approver_name: string | null;
  approver_email: string | null;
}

export interface ProcessWithFlow {
  id: string;
  name: string;
  description: string | null;
  is_active: number;
  created_at: string;
  request_count: number;
  levels: ProcessLevel[];
}

export interface CreateProcessBody {
  name: string;
  description?: string;
  levels: {
    level: number;
    label: string;
    approver_type: 'fixed_user' | 'job_title';
    approver_value: string;
    approver_name?: string;
    approver_email?: string;
  }[];
}

export interface FullProcessBody extends CreateProcessBody {
  id?: string;
  fields: FormFieldInput[];
  form_schema_json: string;
  email_subject: string;
  email_body: string;
  color: string;
  icon: string;
  category?: string;
  default_sla_days: number;
  workspace_id?: string;
  assignment_mode: 'auto_load' | 'manual' | 'fixed_user';
  fixed_assignee_id?: string;
  fixed_assignee_name?: string;
  fixed_assignee_email?: string;
  execution_sla_days: number;
  checklist_json: string;
  deliverables_json: string;
  require_requester_confirmation: number;
}

// ─── Tickets ──────────────────────────────────────────────────────────────────
export type TicketDept     = 'marketing' | 'bi' | 'comercial' | 'sso' | 'operaciones';
export type TicketStatus   = 'todo' | 'in_progress' | 'review' | 'done';
export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface Ticket {
  id: string;
  department: TicketDept;
  title: string;
  description: string | null;
  priority: TicketPriority;
  status: TicketStatus;
  assigned_to_id: string | null;
  assigned_to_name: string | null;
  assigned_to_email: string | null;
  created_by_id: string;
  created_by_name: string;
  due_date: string | null;
  tags_json: string | null;
  created_at: string;
  updated_at: string;
}

export interface TeamMember {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  department: TicketDept;
  is_active: number;
  open_tickets?: number;
  created_at: string;
}

export interface CreateTicketBody {
  department: TicketDept;
  title: string;
  description?: string;
  priority?: TicketPriority;
  due_date?: string;
  tags?: string[];
}

export interface CampaignCostBody {
  request_id: string; campaign_code: string; total_amount: number;
  currency?: string; execution_date: string; billing_date: string; notes?: string;
  vendors: { vendor_name: string; amount: number; is_selected: boolean }[];
}
