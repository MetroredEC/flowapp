import { msalInstance, loginRequest } from '../auth/msal';

const BASE = String(import.meta.env.VITE_API_URL || 'https://flowapp.dbermeo.workers.dev').replace(/\/+$/, '');

async function getToken(): Promise<string> {
 const account = msalInstance.getActiveAccount() ?? msalInstance.getAllAccounts()[0];
 if (!account) throw new Error('No autenticado');
 const result = await msalInstance.acquireTokenSilent({...loginRequest, account });
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
  body: isFormData ? (body as FormData): body ? JSON.stringify(body): undefined,
 });

 if (!res.ok) {
  const err = await res.json().catch(() => ({ message: res.statusText })) as { message?: string; error?: string };
  throw new Error(err.message ?? err.error ?? `Error ${res.status}`);
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

export interface InventoryStockRow {
 location_id: string;
 item_id: string;
 lot_id: string | null;
 quantity_on_hand: number;
 average_cost: number;
 total_value: number;
}

export interface InventoryKardexRow {
 created_at: string;
 entry_type: string;
 location_id: string;
 location_name: string;
 item_id: string;
 item_name: string;
 lot_id: string | null;
 lot_code: string | null;
 quantity_in: number;
 quantity_out: number;
 unit_cost: number;
 total_cost: number;
 balance_quantity: number;
 balance_total_value: number;
 movement_number: string;
 movement_type: string;
}


export interface ProcessBlueprint {
 id: string;
 name: string;
 description: string | null;
 source_text: string | null;
 ai_analysis_json: string | null;
 proposed_process_json: string | null;
 status: string;
 created_by_email: string | null;
 created_at: string;
}
export const api = {
 processBlueprints: () =>
  request<{ data: ProcessBlueprint[] }>('GET', '/api/process-builder/blueprints'),

 createProcessBlueprint: (body: {
  name: string;
  description?: string;
  source_text: string;
 }) =>
  request<{ data: { id: string } }>('POST', '/api/process-builder/blueprints', body),

 analyzeProcessBlueprint: (id: string) =>
  request<{ data: any }>('POST', '/api/process-builder/blueprints/' + id + '/analyze'),

 updateProcessBlueprintProposal: (id: string, proposal: unknown) =>
  request<{ data: { saved: boolean } }>('PUT', '/api/process-builder/blueprints/' + id + '/proposal', { proposal }),

 deployProcessBlueprint: (id: string) =>
  request<{ data: { deployed: boolean; process_definition_id: string } }>('POST', '/api/process-builder/blueprints/' + id + '/deploy'),

 inventoryStock: () =>
  request<{ data: InventoryStockRow[] }>('GET', '/api/inventory/stock'),

 inventoryKardex: () =>
  request<{ data: InventoryKardexRow[] }>('GET', '/api/inventory/kardex'),

 bpmTasksMine: (all = false) =>
  request<{ data: BpmTask[] }>('GET', '/api/bpm-tasks/mine' + (all ? '?all=1': '')),

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
};

// Types
export interface Request {
 id: string; title: string; description: string;
 request_type_id: string; request_type_name: string;
 requester_name: string; requester_email: string;
 status: string; current_level: number; total_levels: number;
 created_at: string; updated_at: string;
 attachment_count: number;
 steps?: ApprovalStep[];
}
export interface RequestDetail extends Request {
 attachments: Attachment[];
 campaign_cost: CampaignCost | null;
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
export interface CampaignCostBody {
 request_id: string; campaign_code: string; total_amount: number;
 currency?: string; execution_date: string; billing_date: string; notes?: string;
 vendors: { vendor_name: string; amount: number; is_selected: boolean }[];
}
