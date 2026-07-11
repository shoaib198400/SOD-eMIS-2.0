const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
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
  login: (loginCode: string, password: string) =>
    request<{ ok: boolean }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ loginCode, password }),
    }),
  logout: () => request<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),
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
