import { useCallback, useEffect, useState } from "react";
import { useAuth } from "./AuthContext";
import { api } from "./api";
import type { ZoneLocation, RevisionRequest } from "./api";
import titleBanner from "./assets/brand/title_banner.png";

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

const STATUS_PILL_CLASS: Record<string, string> = {
  NOT_STARTED: "not-started",
  IN_PROGRESS: "in-progress",
  PENDING_REVIEW: "pending-review",
  SUBMITTED: "submitted",
  REJECTED: "rejected",
};

export function ZoneDashboard() {
  const { user, logout } = useAuth();
  const [monthYear, setMonthYear] = useState(currentMonthKey());
  const [locations, setLocations] = useState<ZoneLocation[]>([]);
  const [requests, setRequests] = useState<RevisionRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [revisionTarget, setRevisionTarget] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const refresh = useCallback(() => {
    api
      .getZoneLocations(monthYear)
      .then((res) => setLocations(res.locations))
      .catch((e) => setError((e as Error).message));
    api
      .getRevisionRequests()
      .then((res) => setRequests(res.requests))
      .catch(() => undefined);
  }, [monthYear]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function submitRevisionRequest() {
    if (!revisionTarget || !reason.trim()) return;
    try {
      await api.createRevisionRequest(revisionTarget, monthYear, reason.trim());
      setRevisionTarget(null);
      setReason("");
      refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <main style={{ maxWidth: 950, margin: "0 auto", padding: "1.4rem" }}>
      <header className="app-header">
        <div>
          <div style={{ fontWeight: 600 }}>SOD eMIS — Zone Dashboard</div>
          <div style={{ fontSize: "0.8rem", opacity: 0.85 }}>{user?.loginCode}</div>
        </div>
        <img src={titleBanner} className="title-banner" alt="" />
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <input type="month" value={monthYear} onChange={(e) => setMonthYear(e.target.value)} style={{ background: "white" }} />
          <button onClick={logout} className="btn btn-secondary">
            Log out
          </button>
        </div>
      </header>

      {error && <p style={{ color: "var(--red)" }}>{error}</p>}

      <div className="dash-card">
        <h2 style={{ fontSize: "1.1rem", color: "var(--navy-deep)", marginTop: 0 }}>Locations</h2>
        <table className="themed-table">
          <thead>
            <tr>
              <th>Location</th>
              <th>Status</th>
              <th>Completion</th>
              <th />
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
                <td>
                  {loc.status === "SUBMITTED" && (
                    <button onClick={() => setRevisionTarget(loc.location_code)} className="btn btn-secondary" style={{ fontSize: "0.8rem", padding: "0.3rem 0.6rem" }}>
                      Request Revision
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {revisionTarget && (
          <div className="sec-card" style={{ marginTop: "1rem" }}>
            <p style={{ marginTop: 0 }}>
              Request revision for <strong>{revisionTarget}</strong> — {monthYear}
            </p>
            <textarea placeholder="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} style={{ width: "100%" }} />
            <div style={{ marginTop: "0.5rem", display: "flex", gap: "0.5rem" }}>
              <button onClick={submitRevisionRequest} disabled={!reason.trim()} className="btn btn-primary">
                Submit Request
              </button>
              <button onClick={() => setRevisionTarget(null)} className="btn btn-secondary">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="dash-card">
        <h2 style={{ fontSize: "1.1rem", color: "var(--navy-deep)", marginTop: 0 }}>Revision Requests (this zone)</h2>
        {requests.length === 0 ? (
          <p style={{ color: "var(--text-muted)" }}>None yet.</p>
        ) : (
          <table className="themed-table">
            <thead>
              <tr>
                <th>Location</th>
                <th>Month</th>
                <th>Reason</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id}>
                  <td>{r.location_name}</td>
                  <td>{r.month_year.slice(0, 7)}</td>
                  <td>{r.reason}</td>
                  <td>{r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
