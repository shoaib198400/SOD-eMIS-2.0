const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";
const TOKEN_STORAGE_KEY = "sod_mis_token";
const REFRESHED_TOKEN_HEADER = "x-refreshed-token";

// Sessions travel as a bearer token rather than a cookie: the frontend and backend live on
// different top-level domains with no shared custom domain, and browsers increasingly block
// or partition cookies set across sites like that even with SameSite=None.
export function getToken(): string | null {
  return sessionStorage.getItem(TOKEN_STORAGE_KEY);
}

function setToken(token: string): void {
  sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
}

function clearToken(): void {
  sessionStorage.removeItem(TOKEN_STORAGE_KEY);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  const refreshed = res.headers.get(REFRESHED_TOKEN_HEADER);
  if (refreshed) setToken(refreshed);

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (res.status === 401) clearToken();
    throw new Error(body.message || body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

export interface FieldDef {
  no: number;
  key: string;
  label: string;
  type: "number" | "int" | "select" | "textarea" | "date";
  req: boolean;
  min: number | null;
  max: number | null;
  dec: number | null;
  opts: string[] | null;
  hint: string;
  sub: string;
  auto: string | null;
  showWhen?: Record<string, string>;
}

export interface FieldDefsResponse {
  sectionNo: number;
  sectionName: string;
  locType: string;
  fields: FieldDef[];
}

export type SubmissionStatus = "NOT_STARTED" | "IN_PROGRESS" | "PENDING_REVIEW" | "SUBMITTED" | "REJECTED";

export interface SubmissionResponse {
  status: SubmissionStatus;
  completionPct: number;
  checkerNotes: string | null;
  values: Record<string, string>;
  sectionsComplete: Record<number, boolean>;
}

export interface SaveSectionResponse extends SubmissionResponse {
  sectionComplete: boolean;
}

export interface DetailRow {
  id?: number;
  [key: string]: string | number | undefined;
}

export interface MiFieldDef {
  key: string;
  label: string;
  type: "text" | "int" | "float" | "date" | "select" | "textarea";
  required: boolean;
  opts?: string[];
  maxChars?: number;
  showWhen?: Record<string, string>;
}

export interface MiTabStatus {
  key: string;
  label: string;
  isMultiRow: boolean;
  complete: boolean;
}

export interface MiStatusResponse {
  tabs: MiTabStatus[];
  allComplete: boolean;
  tankOpts: string[];
}

export interface MiTabResponse {
  label: string;
  isMultiRow: boolean;
  naLabel: string;
  fields: MiFieldDef[];
  isNotApplicable: boolean;
  rows: Record<string, string>[];
}

export interface ZoneLocation {
  location_code: string;
  location_name: string;
  loc_type: string;
  status: SubmissionStatus;
  completion_pct: string;
}

export interface RevisionRequest {
  id: number;
  location_code: string;
  location_name: string;
  month_year: string;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  requested_by: number;
  actioned_by: number | null;
  actioned_at: string | null;
  created_at: string;
}

export interface AdminLocation {
  code: string;
  name: string;
  loc_type: string;
  zone_id: number | null;
  zone_name: string | null;
  active: boolean;
  is_excluded: boolean;
}

export interface Zone {
  id: number;
  name: string;
}

export interface HelpdeskTicket {
  id: number;
  created_at: string;
  location_code: string;
  user_id: number;
  issue_type: string;
  issue_desc: string;
  status: "OPEN" | "RESPONDED" | "CLOSED";
  admin_response: string | null;
  responded_at: string | null;
  responded_by: number | null;
}

export interface AuditLogEntry {
  id: number;
  occurred_at: string;
  actor_user_id: number | null;
  actor_login_code: string | null;
  actor_location_code: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  details: Record<string, unknown> | null;
}

export interface MeResponse {
  userId: number;
  loginCode: string;
  role: "Maker" | "Checker" | "Zone" | "Admin" | "Viewer";
  locationCode: string | null;
  locationName: string | null;
  zoneId: number | null;
  zoneName: string | null;
  isFirstLogin: boolean;
}

export const api = {
  login: async (loginCode: string, password: string) => {
    const result = await request<{ ok: boolean; token: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ loginCode, password }),
    });
    setToken(result.token);
    return result;
  },
  forgotPassword: (loginCode: string, issueDesc: string) =>
    request<{ ok: boolean }>("/api/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ loginCode, issueDesc }),
    }),
  logout: async () => {
    try {
      await request<{ ok: boolean }>("/api/auth/logout", { method: "POST" });
    } finally {
      clearToken();
    }
  },
  me: () => request<MeResponse>("/api/auth/me"),
  fieldDefs: (sectionNo: number) => request<FieldDefsResponse>(`/api/field-defs/${sectionNo}`),
  getSubmission: (locationCode: string, monthYear: string) =>
    request<SubmissionResponse>(`/api/submissions/${locationCode}/${monthYear}`),
  saveSection: (locationCode: string, monthYear: string, sectionNo: number, values: Record<string, string>) =>
    request<SaveSectionResponse>(`/api/submissions/${locationCode}/${monthYear}/sections/${sectionNo}`, {
      method: "PATCH",
      body: JSON.stringify({ values }),
    }),
  submit: (locationCode: string, monthYear: string) =>
    request<{ status: SubmissionStatus }>(`/api/submissions/${locationCode}/${monthYear}/submit`, {
      method: "POST",
    }),
  approve: (locationCode: string, monthYear: string) =>
    request<{ status: SubmissionStatus }>(`/api/submissions/${locationCode}/${monthYear}/approve`, {
      method: "POST",
    }),
  reject: (locationCode: string, monthYear: string, note: string) =>
    request<{ status: SubmissionStatus }>(`/api/submissions/${locationCode}/${monthYear}/reject`, {
      method: "POST",
      body: JSON.stringify({ note }),
    }),
  reset: (locationCode: string, monthYear: string, reason: string) =>
    request<{ status: SubmissionStatus }>(`/api/submissions/${locationCode}/${monthYear}/reset`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),
  getDetailTable: (locationCode: string, monthYear: string, tableType: string) =>
    request<{ rows: DetailRow[] }>(`/api/submissions/${locationCode}/${monthYear}/detail-tables/${tableType}`),
  saveDetailTable: (locationCode: string, monthYear: string, tableType: string, rows: DetailRow[]) =>
    request<{ rows: DetailRow[] }>(`/api/submissions/${locationCode}/${monthYear}/detail-tables/${tableType}`, {
      method: "PUT",
      body: JSON.stringify({ rows }),
    }),
  getMiStatus: (locationCode: string, monthYear: string) =>
    request<MiStatusResponse>(`/api/mi/${locationCode}/${monthYear}/status`),
  getMiTab: (locationCode: string, monthYear: string, tabKey: string) =>
    request<MiTabResponse>(`/api/mi/${locationCode}/${monthYear}/${tabKey}`),
  saveMiTab: (locationCode: string, monthYear: string, tabKey: string, isNotApplicable: boolean, rows: Record<string, string>[]) =>
    request<{ ok: boolean }>(`/api/mi/${locationCode}/${monthYear}/${tabKey}`, {
      method: "PUT",
      body: JSON.stringify({ isNotApplicable, rows }),
    }),
  getZoneLocations: (monthYear: string) =>
    request<{ locations: ZoneLocation[] }>(`/api/zone/locations?monthYear=${monthYear}`),
  createRevisionRequest: (locationCode: string, monthYear: string, reason: string) =>
    request<{ ok: boolean; id: number }>("/api/zone/revision-requests", {
      method: "POST",
      body: JSON.stringify({ locationCode, monthYear, reason }),
    }),
  getRevisionRequests: () => request<{ requests: RevisionRequest[] }>("/api/zone/revision-requests"),
  approveRevisionRequest: (id: number) =>
    request<{ ok: boolean }>(`/api/zone/revision-requests/${id}/approve`, { method: "PATCH" }),
  rejectRevisionRequest: (id: number) =>
    request<{ ok: boolean }>(`/api/zone/revision-requests/${id}/reject`, { method: "PATCH" }),
  getAdminLocations: () => request<{ locations: AdminLocation[] }>("/api/admin/locations"),
  getZones: () => request<{ zones: Zone[] }>("/api/admin/zones"),
  updateLocation: (code: string, updates: { zoneId?: number; isExcluded?: boolean }) =>
    request<{ ok: boolean }>(`/api/admin/locations/${code}`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    }),
  getAdminHelpdeskTickets: (status?: string) =>
    request<{ tickets: HelpdeskTicket[] }>(`/api/admin/helpdesk-tickets${status ? `?status=${status}` : ""}`),
  respondToTicket: (id: number, response: string, status: "RESPONDED" | "CLOSED") =>
    request<{ ok: boolean }>(`/api/admin/helpdesk-tickets/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ response, status }),
    }),
  getAuditLog: (limit = 100) => request<{ entries: AuditLogEntry[] }>(`/api/admin/audit-log?limit=${limit}`),
  getTraffic: (date: string) =>
    request<{ date: string; hours: { hour: number; distinctLogins: number }[] }>(`/api/admin/traffic?date=${date}`),
  fileHelpdeskTicket: (issueType: string, issueDesc: string) =>
    request<{ ok: boolean; id: number }>("/api/helpdesk/tickets", {
      method: "POST",
      body: JSON.stringify({ issueType, issueDesc }),
    }),
  getMyHelpdeskTickets: () => request<{ tickets: HelpdeskTicket[] }>("/api/helpdesk/tickets"),
  setupZoneAccounts: () => request<{ ok: boolean; added: string[] }>("/api/admin/setup-zone-accounts", { method: "POST" }),
  syncMissingLocationAccounts: () =>
    request<{ ok: boolean; added: string[] }>("/api/admin/sync-missing-location-accounts", { method: "POST" }),
  getZoneAccounts: () =>
    request<{ accounts: { id: number; login_code: string; role: string; zone_name: string | null; active: boolean; last_login_at: string | null }[] }>(
      "/api/admin/zone-accounts"
    ),
  resetLocationData: (locationCodes: string[]) =>
    request<{ ok: boolean; submissionsDeleted: number }>("/api/admin/reset-location-data", {
      method: "POST",
      body: JSON.stringify({ locationCodes }),
    }),
  uploadTankMaster: (rows: { locationCode: string; tankNo: string }[]) =>
    request<{ ok: boolean; inserted: number }>("/api/admin/tank-master/upload", {
      method: "POST",
      body: JSON.stringify({ rows }),
    }),
  getAnalyticsFieldData: (fyStartYear: number, fields: string[]) =>
    request<{ months: string[]; rows: { locationCode: string; locationName: string; zoneName: string | null; monthYear: string; values: Record<string, string> }[] }>(
      `/api/analytics/field-data?fyStartYear=${fyStartYear}&fields=${fields.join(",")}`
    ),
  getAnalyticsCompliance: (fyStartYear: number) =>
    request<{
      months: string[];
      heatmap: { locationCode: string; locationName: string; monthYear: string; status: string }[];
      monthlyCompliance: { monthYear: string; totalLocations: number; submittedCount: number; pct: number }[];
      leaderboard: { locationCode: string; locationName: string; submittedCount: number; totalMonths: number; pct: number }[];
    }>(`/api/analytics/compliance?fyStartYear=${fyStartYear}`),
};
