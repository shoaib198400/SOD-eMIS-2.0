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

export interface SubmissionResponse {
  status: "NOT_STARTED" | "IN_PROGRESS" | "PENDING_REVIEW" | "SUBMITTED" | "REJECTED";
  completionPct: number;
  checkerNotes: string | null;
  values: Record<string, string>;
}

export interface SaveSectionResponse extends SubmissionResponse {
  sectionComplete: boolean;
}

export interface MeResponse {
  userId: number;
  loginCode: string;
  role: "Maker" | "Checker" | "Zone" | "Admin" | "Viewer";
  locationCode: string | null;
  zoneId: number | null;
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
};
