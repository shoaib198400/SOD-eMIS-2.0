import { useCallback, useEffect, useState } from "react";
import { useAuth } from "./AuthContext";
import { api } from "./api";
import type { ZoneLocation, RevisionRequest } from "./api";

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

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
    <main style={{ maxWidth: 900, margin: "2rem auto", fontFamily: "sans-serif", padding: "0 1rem" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "1.3rem" }}>SOD eMIS — Zone Dashboard</h1>
          <p style={{ margin: 0, color: "#555" }}>{user?.loginCode}</p>
        </div>
        <div>
          <label style={{ marginRight: "1rem" }}>
            Month: <input type="month" value={monthYear} onChange={(e) => setMonthYear(e.target.value)} />
          </label>
          <button onClick={logout}>Log out</button>
        </div>
      </header>

      {error && <p style={{ color: "crimson" }}>{error}</p>}

      <h2 style={{ fontSize: "1.1rem" }}>Locations</h2>
      <table style={{ borderCollapse: "collapse", width: "100%", marginBottom: "1.5rem" }}>
        <thead>
          <tr>
            <th style={{ border: "1px solid #ddd", padding: "0.4rem", textAlign: "left" }}>Location</th>
            <th style={{ border: "1px solid #ddd", padding: "0.4rem", textAlign: "left" }}>Status</th>
            <th style={{ border: "1px solid #ddd", padding: "0.4rem", textAlign: "left" }}>Completion</th>
            <th style={{ border: "1px solid #ddd", padding: "0.4rem" }} />
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
              <td style={{ border: "1px solid #ddd", padding: "0.4rem" }}>
                {loc.status === "SUBMITTED" && (
                  <button onClick={() => setRevisionTarget(loc.location_code)}>Request Revision</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {revisionTarget && (
        <div style={{ border: "1px solid #ccc", borderRadius: 6, padding: "0.75rem", marginBottom: "1.5rem" }}>
          <p>
            Request revision for <strong>{revisionTarget}</strong> — {monthYear}
          </p>
          <textarea
            placeholder="Reason (required)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            style={{ width: "100%", padding: "0.4rem" }}
          />
          <div style={{ marginTop: "0.5rem" }}>
            <button onClick={submitRevisionRequest} disabled={!reason.trim()}>
              Submit Request
            </button>{" "}
            <button onClick={() => setRevisionTarget(null)}>Cancel</button>
          </div>
        </div>
      )}

      <h2 style={{ fontSize: "1.1rem" }}>Revision Requests (this zone)</h2>
      {requests.length === 0 ? (
        <p style={{ color: "#555" }}>None yet.</p>
      ) : (
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              <th style={{ border: "1px solid #ddd", padding: "0.4rem", textAlign: "left" }}>Location</th>
              <th style={{ border: "1px solid #ddd", padding: "0.4rem", textAlign: "left" }}>Month</th>
              <th style={{ border: "1px solid #ddd", padding: "0.4rem", textAlign: "left" }}>Reason</th>
              <th style={{ border: "1px solid #ddd", padding: "0.4rem", textAlign: "left" }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => (
              <tr key={r.id}>
                <td style={{ border: "1px solid #ddd", padding: "0.4rem" }}>{r.location_name}</td>
                <td style={{ border: "1px solid #ddd", padding: "0.4rem" }}>{r.month_year.slice(0, 7)}</td>
                <td style={{ border: "1px solid #ddd", padding: "0.4rem" }}>{r.reason}</td>
                <td style={{ border: "1px solid #ddd", padding: "0.4rem" }}>{r.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
