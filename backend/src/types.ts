export type AppEnv = {
  Bindings: {
    DB: D1Database;
    FILES: R2Bucket;
    KV: KVNamespace;
    TOKEN_SECRET: string;
    ENTRA_CLIENT_SECRET: string;
    ENTRA_TENANT_ID: string;
    ENTRA_CLIENT_ID: string;
    ENTRA_API_AUDIENCE: string;
    ALLOWED_ORIGINS: string;
    PLATFORM_URL: string;
    FRONTEND_URL?: string;
    PUBLIC_API_URL?: string;
    MAIL_SENDER_UPN?: string;
    TEAMS_WEBHOOK_URL?: string;
    APP_ENV: string;
  };
  Variables: {
    userId: string;
    userEmail: string;
    userName: string;
    userRoles: string[];
    traceId: string;
    requestStartedAt: number;
  };
};

export interface RequestRow {
  id: string;
  request_type_id: string;
  request_type_name: string;
  title: string;
  description: string;
  requester_id: string;
  requester_name: string;
  requester_email: string;
  status: string;
  current_level: number;
  total_levels: number;
  campaign_data: string | null;
  process_version_id: string | null;
  process_version: number | null;
  submitted_at: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  cancelled_at: string | null;
  closed_at: string | null;
  sla_due_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApprovalStepRow {
  id: string;
  request_id: string;
  level: number;
  label: string;
  approver_id: string;
  approver_name: string;
  approver_email: string;
  status: string;
  comment: string | null;
  decided_at: string | null;
  notified_at: string | null;
  created_at: string;
}

export interface FlowConfigRow {
  id: string;
  request_type_id: string;
  level: number;
  label: string;
  approver_type: 'fixed_user' | 'job_title';
  approver_value: string;
  approver_name: string | null;
  approver_email: string | null;
  is_active: number;
}

export interface GraphUser {
  id: string;
  displayName: string;
  mail: string | null;
  userPrincipalName: string;
  jobTitle: string | null;
  department: string | null;
}
