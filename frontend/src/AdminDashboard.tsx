import { useCallback, useEffect, useState } from "react";
import { useAuth } from "./AuthContext";
import { api } from "./api";
import type { ZoneLocation, RevisionRequest, AdminLocation, Zone, HelpdeskTicket, AuditLogEntry } from "./api";
import titleBanner from "./assets/brand/title_banner.png";
import sideLogo from "./assets/brand/side_logo.png";

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
type AdminTool = "setup-zone" | "audit-accounts" | "sync-tank-master" | "sync-locations" | "reset-data" | null;

export function AdminDashboard() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState<Tab>("overview");
  const [tool, setTool] = useState<AdminTool>(null);

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <img src={sideLogo} className="side-logo" alt="" />
        <div style={{ color: "white", fontWeight: 700, fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.5px" }}>
          HQO Admin
        </div>
        <div style={{ color: "rgba(255,255,255,0.75)", fontSize: "0.8rem", marginBottom: "0.75rem" }}>All Zones — Full Access</div>

        <div style={{ fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.6px", color: "rgba(255,255,255,0.6)", margin: "0.4rem 0 0.2rem 0.3rem" }}>
          Admin Tools
        </div>
        <button onClick={() => setTool(tool === "setup-zone" ? null : "setup-zone")} className={`nav-btn${tool === "setup-zone" ? " active" : ""}`}>
          ⚙️ Setup Zone Accounts
        </button>
        <button onClick={() => setTool(tool === "audit-accounts" ? null : "audit-accounts")} className={`nav-btn${tool === "audit-accounts" ? " active" : ""}`}>
          🔎 Audit Zone &amp; Admin Accounts
        </button>
        <button onClick={() => setTool(tool === "sync-tank-master" ? null : "sync-tank-master")} className={`nav-btn${tool === "sync-tank-master" ? " active" : ""}`}>
          📥 Upload Tank Master
        </button>
        <button onClick={() => setTool(tool === "sync-locations" ? null : "sync-locations")} className={`nav-btn${tool === "sync-locations" ? " active" : ""}`}>
          ➕ Sync Missing Location Accounts
        </button>
        <button onClick={() => setTool(tool === "reset-data" ? null : "reset-data")} className={`nav-btn${tool === "reset-data" ? " active" : ""}`}>
          🗑 Reset Location Data
        </button>
      </aside>

      <main className="app-main">
        <header className="app-header">
          <div>
            <div style={{ fontWeight: 700, fontSize: "1.1rem" }}>HPCL SOD — MIS Entry Portal</div>
            <div style={{ fontSize: "0.8rem", opacity: 0.85 }}>Supply, Operations &amp; Distribution</div>
          </div>
          <img src={titleBanner} className="title-banner" alt="" />
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <span className="location-pill">📍 HQ Operations | {user?.loginCode}</span>
            <button className="btn-logout" onClick={logout}>
              ↪ Logout
            </button>
          </div>
        </header>

        {tool && (
          <div className="dash-card">
            <AdminToolPanel tool={tool} onClose={() => setTool(null)} />
          </div>
        )}

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
    </div>
  );
}

function AdminToolPanel({ tool, onClose }: { tool: Exclude<AdminTool, null>; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [codes, setCodes] = useState("");
  const [csvText, setCsvText] = useState("");
  const [accounts, setAccounts] = useState<{ id: number; login_code: string; role: string; zone_name: string | null; active: boolean }[]>([]);

  useEffect(() => {
    if (tool === "audit-accounts") {
      api.getZoneAccounts().then((r) => setAccounts(r.accounts));
    }
  }, [tool]);

  async function runSetupZone() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.setupZoneAccounts();
      setResult(res.added.length ? `Created: ${res.added.join(", ")}` : "All zone accounts already exist.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function runSyncLocations() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.syncMissingLocationAccounts();
      setResult(res.added.length ? `Created: ${res.added.join(", ")}` : "All locations already have Maker/Checker accounts.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function runResetData() {
    const locationCodes = codes.split(",").map((c) => c.trim()).filter(Boolean);
    if (locationCodes.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.resetLocationData(locationCodes);
      setResult(`Deleted ${res.submissionsDeleted} submission(s) for: ${locationCodes.join(", ")}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function runTankMasterUpload() {
    const rows = csvText
      .split("\n")
      .map((line) => line.split(",").map((s) => s.trim()))
      .filter((cols) => cols.length >= 2 && cols[0])
      .map(([locationCode, tankNo]) => ({ locationCode, tankNo }));
    if (rows.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.uploadTankMaster(rows);
      setResult(`Inserted ${res.inserted} new tank record(s) from ${rows.length} row(s) submitted.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
        <strong style={{ color: "var(--navy-deep)" }}>
          {tool === "setup-zone" && "Setup Zone Accounts"}
          {tool === "audit-accounts" && "Audit Zone & Admin Accounts"}
          {tool === "sync-tank-master" && "Upload Tank Master"}
          {tool === "sync-locations" && "Sync Missing Location Accounts"}
          {tool === "reset-data" && "Reset Location Data"}
        </strong>
        <button onClick={onClose} className="btn btn-secondary" style={{ padding: "0.2rem 0.6rem", fontSize: "0.8rem" }}>
          Close
        </button>
      </div>
      {error && <p style={{ color: "var(--red)" }}>{error}</p>}
      {result && <p style={{ color: "#166534" }}>{result}</p>}

      {tool === "setup-zone" && (
        <>
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
            Creates a Zone login for any zone that doesn't have one yet (login code = first 3 letters of the zone name + "ZONE").
          </p>
          <button onClick={runSetupZone} disabled={busy} className="btn btn-save">
            {busy ? "Running..." : "Run Setup"}
          </button>
        </>
      )}

      {tool === "audit-accounts" && (
        <table className="themed-table">
          <thead>
            <tr>
              <th>Login Code</th>
              <th>Role</th>
              <th>Zone</th>
              <th>Active</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.id}>
                <td>{a.login_code}</td>
                <td>{a.role}</td>
                <td>{a.zone_name ?? "—"}</td>
                <td>{a.active ? "Yes" : "No"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {tool === "sync-tank-master" && (
        <>
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
            Paste CSV rows as <code>locationCode,tankNo</code> (one per line).
          </p>
          <textarea value={csvText} onChange={(e) => setCsvText(e.target.value)} placeholder="TESTLOC1,TK-101" style={{ width: "100%", minHeight: 100 }} />
          <button onClick={runTankMasterUpload} disabled={busy || !csvText.trim()} className="btn btn-save" style={{ marginTop: "0.5rem" }}>
            {busy ? "Uploading..." : "Upload"}
          </button>
        </>
      )}

      {tool === "sync-locations" && (
        <>
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
            Adds Maker/Checker accounts for any location that's missing one. Default password = location code (users must change it).
          </p>
          <button onClick={runSyncLocations} disabled={busy} className="btn btn-save">
            {busy ? "Running..." : "Run Sync"}
          </button>
        </>
      )}

      {tool === "reset-data" && (
        <>
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
            Deletes all MIS submission data for specific location codes. Use before launch to wipe test data. This cannot be undone.
          </p>
          <input value={codes} onChange={(e) => setCodes(e.target.value)} placeholder="e.g. TESTLOC1, TESTLOC2" style={{ width: "100%" }} />
          <button onClick={runResetData} disabled={busy || !codes.trim()} className="btn btn-primary" style={{ marginTop: "0.5rem" }}>
            {busy ? "Deleting..." : "Delete Data"}
          </button>
        </>
      )}
    </div>
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

  const stats = {
    total: locations.length,
    submitted: locations.filter((l) => l.status === "SUBMITTED").length,
    pendingReview: locations.filter((l) => l.status === "PENDING_REVIEW").length,
    inProgress: locations.filter((l) => l.status === "IN_PROGRESS").length,
    notFiled: locations.filter((l) => l.status === "NOT_STARTED").length,
  };

  return (
    <div>
      <label>
        Month: <input type="month" value={monthYear} onChange={(e) => setMonthYear(e.target.value)} />
      </label>
      {error && <p style={{ color: "var(--red)" }}>{error}</p>}

      <div className="stat-row" style={{ gridTemplateColumns: "repeat(5, 1fr)" }}>
        <div className="stat-card" style={{ borderLeft: "4px solid #6b7280" }}>
          <div className="label">Total Locations</div>
          <div className="value">{stats.total}</div>
        </div>
        <div className="stat-card" style={{ borderLeft: "4px solid #16a34a" }}>
          <div className="label">Submitted</div>
          <div className="value" style={{ color: "#16a34a" }}>{stats.submitted}</div>
        </div>
        <div className="stat-card" style={{ borderLeft: "4px solid #f59e0b" }}>
          <div className="label">Pending Review</div>
          <div className="value" style={{ color: "#f59e0b" }}>{stats.pendingReview}</div>
        </div>
        <div className="stat-card" style={{ borderLeft: "4px solid #2563eb" }}>
          <div className="label">In Progress</div>
          <div className="value" style={{ color: "#2563eb" }}>{stats.inProgress}</div>
        </div>
        <div className="stat-card" style={{ borderLeft: "4px solid #9ca3af" }}>
          <div className="label">Not Filed</div>
          <div className="value">{stats.notFiled}</div>
        </div>
      </div>

      <h3 style={{ color: "var(--navy-deep)" }}>All Locations — {monthYear}</h3>
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
