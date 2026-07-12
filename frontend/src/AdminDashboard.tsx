import { useCallback, useEffect, useState } from "react";
import { useAuth } from "./AuthContext";
import { api } from "./api";
import type { ZoneLocation, RevisionRequest, AdminLocation, Zone, HelpdeskTicket, AuditLogEntry } from "./api";

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

type Tab = "overview" | "locations" | "helpdesk" | "audit" | "traffic";

export function AdminDashboard() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState<Tab>("overview");

  return (
    <main style={{ maxWidth: 1000, margin: "2rem auto", fontFamily: "sans-serif", padding: "0 1rem" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "1.3rem" }}>SOD eMIS — Admin</h1>
          <p style={{ margin: 0, color: "#555" }}>{user?.loginCode}</p>
        </div>
        <button onClick={logout}>Log out</button>
      </header>

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
        {(["overview", "locations", "helpdesk", "audit", "traffic"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{ padding: "0.4rem 0.8rem", background: tab === t ? "#e0e7ff" : "transparent", border: "1px solid #ddd", borderRadius: 4 }}
          >
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === "overview" && <OverviewTab />}
      {tab === "locations" && <LocationsTab />}
      {tab === "helpdesk" && <HelpdeskTab />}
      {tab === "audit" && <AuditTab />}
      {tab === "traffic" && <TrafficTab />}
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
      {error && <p style={{ color: "crimson" }}>{error}</p>}

      <h3>All Locations</h3>
      <table style={{ borderCollapse: "collapse", width: "100%", marginBottom: "1.5rem" }}>
        <thead>
          <tr>
            <th style={{ border: "1px solid #ddd", padding: "0.4rem", textAlign: "left" }}>Location</th>
            <th style={{ border: "1px solid #ddd", padding: "0.4rem", textAlign: "left" }}>Status</th>
            <th style={{ border: "1px solid #ddd", padding: "0.4rem", textAlign: "left" }}>Completion</th>
          </tr>
        </thead>
        <tbody>
          {locations.map((loc) => (
            <tr key={loc.location_code}>
              <td style={{ border: "1px solid #ddd", padding: "0.4rem" }}>
                {loc.location_name} ({loc.location_code})
              </td>
              <td style={{ border: "1px solid #ddd", padding: "0.4rem" }}>{loc.status}</td>
              <td style={{ border: "1px solid #ddd", padding: "0.4rem" }}>{loc.completion_pct}%</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Revision Requests</h3>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            <th style={{ border: "1px solid #ddd", padding: "0.4rem", textAlign: "left" }}>Location</th>
            <th style={{ border: "1px solid #ddd", padding: "0.4rem", textAlign: "left" }}>Month</th>
            <th style={{ border: "1px solid #ddd", padding: "0.4rem", textAlign: "left" }}>Reason</th>
            <th style={{ border: "1px solid #ddd", padding: "0.4rem", textAlign: "left" }}>Status</th>
            <th style={{ border: "1px solid #ddd", padding: "0.4rem" }} />
          </tr>
        </thead>
        <tbody>
          {requests.map((r) => (
            <tr key={r.id}>
              <td style={{ border: "1px solid #ddd", padding: "0.4rem" }}>{r.location_name}</td>
              <td style={{ border: "1px solid #ddd", padding: "0.4rem" }}>{r.month_year.slice(0, 7)}</td>
              <td style={{ border: "1px solid #ddd", padding: "0.4rem" }}>{r.reason}</td>
              <td style={{ border: "1px solid #ddd", padding: "0.4rem" }}>{r.status}</td>
              <td style={{ border: "1px solid #ddd", padding: "0.4rem" }}>
                {r.status === "PENDING" && (
                  <>
                    <button onClick={() => handle(() => api.approveRevisionRequest(r.id))}>Approve</button>{" "}
                    <button onClick={() => handle(() => api.rejectRevisionRequest(r.id))}>Reject</button>
                  </>
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
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            <th style={{ border: "1px solid #ddd", padding: "0.4rem", textAlign: "left" }}>Location</th>
            <th style={{ border: "1px solid #ddd", padding: "0.4rem", textAlign: "left" }}>Zone</th>
            <th style={{ border: "1px solid #ddd", padding: "0.4rem", textAlign: "left" }}>Excluded (non-operational)</th>
          </tr>
        </thead>
        <tbody>
          {locations.map((loc) => (
            <tr key={loc.code}>
              <td style={{ border: "1px solid #ddd", padding: "0.4rem" }}>
                {loc.name} ({loc.code})
              </td>
              <td style={{ border: "1px solid #ddd", padding: "0.4rem" }}>
                <select value={loc.zone_id ?? ""} onChange={(e) => updateZone(loc.code, e.target.value)}>
                  <option value="">None</option>
                  {zones.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.name}
                    </option>
                  ))}
                </select>
              </td>
              <td style={{ border: "1px solid #ddd", padding: "0.4rem" }}>
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
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      {tickets.map((t) => (
        <div key={t.id} style={{ border: "1px solid #ddd", borderRadius: 6, padding: "0.75rem", marginBottom: "0.75rem" }}>
          <p style={{ margin: 0 }}>
            <strong>{t.location_code}</strong> — {t.issue_type} — <em>{t.status}</em>
          </p>
          <p style={{ margin: "0.25rem 0" }}>{t.issue_desc}</p>
          {t.admin_response && <p style={{ color: "#065f46" }}>Response: {t.admin_response}</p>}
          {t.status === "OPEN" && (
            <div>
              <textarea
                value={responses[t.id] ?? ""}
                onChange={(e) => setResponses((prev) => ({ ...prev, [t.id]: e.target.value }))}
                style={{ width: "100%", padding: "0.4rem" }}
                placeholder="Your response..."
              />
              <button onClick={() => respond(t.id)}>Send Response</button>
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
    <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "0.85rem" }}>
      <thead>
        <tr>
          <th style={{ border: "1px solid #ddd", padding: "0.3rem", textAlign: "left" }}>Time</th>
          <th style={{ border: "1px solid #ddd", padding: "0.3rem", textAlign: "left" }}>Actor</th>
          <th style={{ border: "1px solid #ddd", padding: "0.3rem", textAlign: "left" }}>Action</th>
          <th style={{ border: "1px solid #ddd", padding: "0.3rem", textAlign: "left" }}>Entity</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((e) => (
          <tr key={e.id}>
            <td style={{ border: "1px solid #ddd", padding: "0.3rem" }}>{new Date(e.occurred_at).toLocaleString()}</td>
            <td style={{ border: "1px solid #ddd", padding: "0.3rem" }}>{e.actor_login_code ?? "—"}</td>
            <td style={{ border: "1px solid #ddd", padding: "0.3rem" }}>{e.action}</td>
            <td style={{ border: "1px solid #ddd", padding: "0.3rem" }}>
              {e.entity_type ? `${e.entity_type} #${e.entity_id}` : "—"}
            </td>
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
      <table style={{ borderCollapse: "collapse", width: "100%", marginTop: "0.75rem" }}>
        <thead>
          <tr>
            <th style={{ border: "1px solid #ddd", padding: "0.3rem" }}>Hour</th>
            <th style={{ border: "1px solid #ddd", padding: "0.3rem" }}>Distinct Logins</th>
          </tr>
        </thead>
        <tbody>
          {hours.map((h) => (
            <tr key={h.hour}>
              <td style={{ border: "1px solid #ddd", padding: "0.3rem" }}>{h.hour}:00</td>
              <td style={{ border: "1px solid #ddd", padding: "0.3rem" }}>{h.distinctLogins}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
