import { useCallback, useEffect, useState } from "react";
import { useAuth } from "./AuthContext";
import { api } from "./api";
import type { ZoneLocation, RevisionRequest, AdminLocation, Zone, HelpdeskTicket, AuditLogEntry } from "./api";
import titleBanner from "./assets/brand/title_banner.png";

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

const STATUS_PILL_CLASS: Record<string, string> = {
  NOT_STARTED: "not-started",
  IN_PROGRESS: "in-progress",
  PENDING_REVIEW: "pending-review",
  SUBMITTED: "submitted",
  REJECTED: "rejected",
};

type Tab = "overview" | "locations" | "helpdesk" | "audit" | "traffic";

export function AdminDashboard() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState<Tab>("overview");

  return (
    <main style={{ maxWidth: 1000, margin: "0 auto", padding: "1.4rem" }}>
      <header className="app-header">
        <div>
          <div style={{ fontWeight: 600 }}>SOD eMIS — Admin</div>
          <div style={{ fontSize: "0.8rem", opacity: 0.85 }}>{user?.loginCode}</div>
        </div>
        <img src={titleBanner} className="title-banner" alt="" />
        <button onClick={logout} className="btn btn-secondary">
          Log out
        </button>
      </header>

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
        {(["overview", "locations", "helpdesk", "audit", "traffic"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="btn btn-secondary"
            style={{ opacity: tab === t ? 1 : 0.55, boxShadow: "none" }}
          >
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      <div className="dash-card">
        {tab === "overview" && <OverviewTab />}
        {tab === "locations" && <LocationsTab />}
        {tab === "helpdesk" && <HelpdeskTab />}
        {tab === "audit" && <AuditTab />}
        {tab === "traffic" && <TrafficTab />}
      </div>
    </main>
  );
}

function OverviewTab() {
  const [monthYear, setMonthYear] = useState(currentMonthKey());
  const [locations, setLocations] = useState<ZoneLocation[]>([]);
  const [requests, setRequests] = useState<RevisionRequest[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    api.getZoneLocations(monthYear).then((r) => setLocations(r.locations)).catch((e) => setError((e as Error).message));
    api.getRevisionRequests().then((r) => setRequests(r.requests)).catch(() => undefined);
  }, [monthYear]);

  useEffect(() => refresh(), [refresh]);

  async function handle(action: () => Promise<unknown>) {
    try {
      await action();
      refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div>
      <label>
        Month: <input type="month" value={monthYear} onChange={(e) => setMonthYear(e.target.value)} />
      </label>
      {error && <p style={{ color: "var(--red)" }}>{error}</p>}

      <h3 style={{ color: "var(--navy-deep)" }}>All Locations</h3>
      <table className="themed-table" style={{ marginBottom: "1.5rem" }}>
        <thead>
          <tr>
            <th>Location</th>
            <th>Status</th>
            <th>Completion</th>
          </tr>
        </thead>
        <tbody>
          {locations.map((loc) => (
            <tr key={loc.location_code}>
              <td>
                {loc.location_name} ({loc.location_code})
              </td>
              <td>
                <span className={`status-pill ${STATUS_PILL_CLASS[loc.status] ?? "not-started"}`}>{loc.status}</span>
              </td>
              <td>{loc.completion_pct}%</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 style={{ color: "var(--navy-deep)" }}>Revision Requests</h3>
      <table className="themed-table">
        <thead>
          <tr>
            <th>Location</th>
            <th>Month</th>
            <th>Reason</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {requests.map((r) => (
            <tr key={r.id}>
              <td>{r.location_name}</td>
              <td>{r.month_year.slice(0, 7)}</td>
              <td>{r.reason}</td>
              <td>{r.status}</td>
              <td>
                {r.status === "PENDING" && (
                  <div style={{ display: "flex", gap: "0.4rem" }}>
                    <button onClick={() => handle(() => api.approveRevisionRequest(r.id))} className="btn btn-approve" style={{ fontSize: "0.8rem", padding: "0.3rem 0.6rem" }}>
                      Approve
                    </button>
                    <button onClick={() => handle(() => api.rejectRevisionRequest(r.id))} className="btn btn-secondary" style={{ fontSize: "0.8rem", padding: "0.3rem 0.6rem" }}>
                      Reject
                    </button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LocationsTab() {
  const [locations, setLocations] = useState<AdminLocation[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    api.getAdminLocations().then((r) => setLocations(r.locations)).catch((e) => setError((e as Error).message));
    api.getZones().then((r) => setZones(r.zones)).catch(() => undefined);
  }, []);

  useEffect(() => refresh(), [refresh]);

  async function updateZone(code: string, zoneId: string) {
    await api.updateLocation(code, { zoneId: Number(zoneId) });
    refresh();
  }
  async function toggleExcluded(code: string, isExcluded: boolean) {
    await api.updateLocation(code, { isExcluded });
    refresh();
  }

  return (
    <div>
      {error && <p style={{ color: "var(--red)" }}>{error}</p>}
      <table className="themed-table">
        <thead>
          <tr>
            <th>Location</th>
            <th>Zone</th>
            <th>Excluded (non-operational)</th>
          </tr>
        </thead>
        <tbody>
          {locations.map((loc) => (
            <tr key={loc.code}>
              <td>
                {loc.name} ({loc.code})
              </td>
              <td>
                <select value={loc.zone_id ?? ""} onChange={(e) => updateZone(loc.code, e.target.value)}>
                  <option value="">None</option>
                  {zones.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.name}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <input type="checkbox" checked={loc.is_excluded} onChange={(e) => toggleExcluded(loc.code, e.target.checked)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HelpdeskTab() {
  const [tickets, setTickets] = useState<HelpdeskTicket[]>([]);
  const [responses, setResponses] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    api.getAdminHelpdeskTickets().then((r) => setTickets(r.tickets)).catch((e) => setError((e as Error).message));
  }, []);
  useEffect(() => refresh(), [refresh]);

  async function respond(id: number) {
    const response = responses[id]?.trim();
    if (!response) return;
    await api.respondToTicket(id, response, "RESPONDED");
    refresh();
  }

  return (
    <div>
      {error && <p style={{ color: "var(--red)" }}>{error}</p>}
      {tickets.map((t) => (
        <div key={t.id} className="sec-card">
          <p style={{ margin: 0 }}>
            <strong style={{ color: "var(--navy)" }}>{t.location_code}</strong> — {t.issue_type} — <em>{t.status}</em>
          </p>
          <p style={{ margin: "0.25rem 0" }}>{t.issue_desc}</p>
          {t.admin_response && <p style={{ color: "#065f46" }}>Response: {t.admin_response}</p>}
          {t.status === "OPEN" && (
            <div>
              <textarea
                value={responses[t.id] ?? ""}
                onChange={(e) => setResponses((prev) => ({ ...prev, [t.id]: e.target.value }))}
                style={{ width: "100%" }}
                placeholder="Your response..."
              />
              <button onClick={() => respond(t.id)} className="btn btn-save" style={{ marginTop: "0.4rem" }}>
                Send Response
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function AuditTab() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  useEffect(() => {
    api.getAuditLog(100).then((r) => setEntries(r.entries));
  }, []);
  return (
    <table className="themed-table" style={{ fontSize: "0.85rem" }}>
      <thead>
        <tr>
          <th>Time</th>
          <th>Actor</th>
          <th>Action</th>
          <th>Entity</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((e) => (
          <tr key={e.id}>
            <td>{new Date(e.occurred_at).toLocaleString()}</td>
            <td>{e.actor_login_code ?? "—"}</td>
            <td>{e.action}</td>
            <td>{e.entity_type ? `${e.entity_type} #${e.entity_id}` : "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TrafficTab() {
  const [date, setDate] = useState(todayKey());
  const [hours, setHours] = useState<{ hour: number; distinctLogins: number }[]>([]);
  useEffect(() => {
    api.getTraffic(date).then((r) => setHours(r.hours));
  }, [date]);
  return (
    <div>
      <label>
        Date: <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <table className="themed-table" style={{ marginTop: "0.75rem" }}>
        <thead>
          <tr>
            <th>Hour</th>
            <th>Distinct Logins</th>
          </tr>
        </thead>
        <tbody>
          {hours.map((h) => (
            <tr key={h.hour}>
              <td>{h.hour}:00</td>
              <td>{h.distinctLogins}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
