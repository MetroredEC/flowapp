import { msalInstance, loginRequest } from '../auth/msal';

const BASE = import.meta.env.VITE_API_URL;

async function getToken(): Promise<string> {
  const account = msalInstance.getActiveAccount() ?? msalInstance.getAllAccounts()[0];
  if (!account) throw new Error('No autenticado');
  const result = await msalInstance.acquireTokenSilent({ ...loginRequest, account });
  return result.accessToken;
}

async function request<T>(
  method: string, path: string, body?: unknown, isFormData = false
): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (body && !isFormData) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: isFormData ? (body as FormData) : body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText })) as { message?: string };
    throw new Error(err.message ?? `Error ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  // Requests
  getRequests:  (params?: Record<string, string>) =>
    request<{ data: Request[] }>('GET', `/api/requests?${new URLSearchParams(params)}`),
  getRequest:   (id: string) =>
    request<{ data: RequestDetail }>('GET', `/api/requests/${id}`),
  createRequest: (body: CreateRequestBody) =>
    request<{ data: { id: string } }>('POST', '/api/requests', body),
  cancelRequest: (id: string) =>
    request<{ data: unknown }>('PATCH', `/api/requests/${id}/cancel`),
  uploadFile: (requestId: string, file: File) => {
    const fd = new FormData(); fd.append('file', file);
    return request<{ data: { id: string; filename: string } }>(
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

// ─── Types ────────────────────────────────────────────────────────────────────
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
  totals: { total: number };
  byStatus: { status: string; count: number }[];
  byType: { request_type_name: string; count: number }[];
}
export interface CampaignCost {
  id: string; campaign_code: string; total_amount: number; currency: string;
  execution_date: string; billing_date: string; notes: string | null; vendors: CampaignVendor[];
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
