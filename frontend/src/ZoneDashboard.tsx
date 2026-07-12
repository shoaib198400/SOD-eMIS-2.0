import { useCallback, useEffect, useState, Suspense, lazy } from "react";
import { useAuth } from "./AuthContext";
import { api } from "./api";
import type { ZoneLocation, RevisionRequest, SubmissionResponse, MiStatusResponse } from "./api";
import { SECTION_NAMES_SHORT } from "./sectionNames";
import { FyMonthPicker } from "./FyMonthPicker";
import titleBanner from "./assets/brand/title_banner.png";
import sideLogo from "./assets/brand/side_logo.png";
const AnalyticsPage = lazy(() => import("./AnalyticsPage").then((m) => ({ default: m.AnalyticsPage })));

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

type Page = "locations" | "analytics" | "reports";

function ReportsPanel({ zoneMonthYear }: { zoneMonthYear: string }) {
  const [monthYear, setMonthYear] = useState(zoneMonthYear);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(key: string, action: () => Promise<void>) {
    setBusy(key);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <h2 style={{ fontSize: "1.1rem", color: "var(--navy-deep)", marginTop: 0 }}>MIS Reports</h2>
      {error && <p style={{ color: "var(--red)" }}>{error}</p>}
      <label>
        Month: <input type="month" value={monthYear} onChange={(e) => setMonthYear(e.target.value)} />
      </label>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.75rem" }}>
        <button
          onClick={() => run("submitted", () => api.exportSubmittedData(monthYear))}
          disabled={busy !== null}
          className="btn btn-save"
        >
          {busy === "submitted" ? "Preparing..." : "⬇ Submitted Data (.xlsx)"}
        </button>
        <button
          onClick={() => run("pending", () => api.exportPendingList(monthYear))}
          disabled={busy !== null}
          className="btn btn-save"
        >
          {busy === "pending" ? "Preparing..." : "⬇ Pending Locations (.xlsx)"}
        </button>
        <button
          onClick={() => run("tank", () => api.exportTankMaster())}
          disabled={busy !== null}
          className="btn btn-save"
        >
          {busy === "tank" ? "Preparing..." : "⬇ Tank Master (.xlsx)"}
        </button>
      </div>
    </div>
  );
}

export function ZoneDashboard() {
  const { user, logout } = useAuth();
  const [page, setPage] = useState<Page>("locations");
  const [monthYear, setMonthYear] = useState(currentMonthKey());
  const [locations, setLocations] = useState<ZoneLocation[]>([]);
  const [requests, setRequests] = useState<RevisionRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [revisionTarget, setRevisionTarget] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [expanded, setExpanded] = useState<{ code: string; type: "view" | "mis" } | null>(null);
  const [viewData, setViewData] = useState<SubmissionResponse | null>(null);
  const [misData, setMisData] = useState<MiStatusResponse | null>(null);

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

  async function toggleView(code: string) {
    if (expanded?.code === code && expanded.type === "view") {
      setExpanded(null);
      return;
    }
    const res = await api.getSubmission(code, monthYear);
    setViewData(res);
    setExpanded({ code, type: "view" });
  }

  async function toggleMis(code: string) {
    if (expanded?.code === code && expanded.type === "mis") {
      setExpanded(null);
      return;
    }
    const res = await api.getMiStatus(code, monthYear);
    setMisData(res);
    setExpanded({ code, type: "mis" });
  }

  const stats = {
    total: locations.length,
    submitted: locations.filter((l) => l.status === "SUBMITTED").length,
    pendingReview: locations.filter((l) => l.status === "PENDING_REVIEW").length,
    inProgress: locations.filter((l) => l.status === "IN_PROGRESS").length,
    notStarted: locations.filter((l) => l.status === "NOT_STARTED" || l.status === "REJECTED").length,
  };

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <img src={sideLogo} className="side-logo" alt="" />
        <div style={{ color: "white", fontWeight: 700, fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.5px" }}>
          Zone View
        </div>
        <div style={{ color: "rgba(255,255,255,0.75)", fontSize: "0.85rem", marginBottom: "0.75rem" }}>{user?.zoneName}</div>
        <button onClick={() => setPage("locations")} className={`nav-btn${page === "locations" ? " active" : ""}`}>
          📍 Locations
        </button>
        <button onClick={() => setPage("analytics")} className={`nav-btn${page === "analytics" ? " active" : ""}`}>
          📊 Analytics
        </button>
        <button onClick={() => setPage("reports")} className={`nav-btn${page === "reports" ? " active" : ""}`}>
          📈 MIS Reports
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
            <span className="location-pill">📍 {user?.zoneName} | Zone</span>
          </div>
        </header>

        <div className="filter-row">
          <FyMonthPicker monthYear={monthYear} onChange={setMonthYear} />
          <button className="btn-logout" onClick={logout}>
            ↪ Logout
          </button>
        </div>

        {error && <p style={{ color: "var(--red)" }}>{error}</p>}

        {page === "analytics" ? (
          <div className="dash-card">
            <Suspense fallback={<p>Loading analytics...</p>}>
              <AnalyticsPage />
            </Suspense>
          </div>
        ) : page === "reports" ? (
          <div className="dash-card">
            <ReportsPanel zoneMonthYear={monthYear} />
          </div>
        ) : (
          <>

            <div className="stat-row" style={{ gridTemplateColumns: "repeat(5, 1fr)" }}>
              <div className="stat-card" style={{ borderLeft: "4px solid #6b7280" }}>
                <div className="label">Total</div>
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
                <div className="label">Pending / Not Started</div>
                <div className="value" style={{ color: "#6b7280" }}>{stats.notStarted}</div>
              </div>
            </div>

            <div className="dash-card">
              <h2 style={{ fontSize: "1.1rem", color: "var(--navy-deep)", marginTop: 0 }}>
                Locations — {user?.zoneName} &middot; {monthYear}
              </h2>
              {locations.map((loc) => (
                <div key={loc.location_code} className="sec-card">
                  <div className="location-row">
                    <div>
                      <strong style={{ color: "var(--navy)" }}>{loc.location_name}</strong>
                      <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{loc.location_code}</div>
                    </div>
                    <div className="pct">{loc.completion_pct}%</div>
                    <span className={`status-pill ${STATUS_PILL_CLASS[loc.status] ?? "not-started"}`}>{loc.status}</span>
                    <div className="actions">
                      <button onClick={() => toggleView(loc.location_code)} className="btn btn-secondary" style={{ fontSize: "0.8rem", padding: "0.3rem 0.7rem" }}>
                        👁 View
                      </button>
                      {loc.status === "SUBMITTED" && (
                        <button onClick={() => setRevisionTarget(loc.location_code)} className="btn btn-secondary" style={{ fontSize: "0.8rem", padding: "0.3rem 0.7rem" }}>
                          🔄 Revision
                        </button>
                      )}
                      <button onClick={() => toggleMis(loc.location_code)} className="btn btn-secondary" style={{ fontSize: "0.8rem", padding: "0.3rem 0.7rem" }}>
                        📊 MIS
                      </button>
                    </div>
                  </div>

                  {expanded?.code === loc.location_code && expanded.type === "view" && viewData && (
                    <div className="section-check-grid" style={{ marginTop: "0.75rem" }}>
                      {Object.entries(SECTION_NAMES_SHORT).map(([num, name]) => {
                        const done = viewData.sectionsComplete[Number(num)];
                        return (
                          <div key={num} className={`section-check ${done ? "done" : "pending"}`}>
                            {done ? "✅" : "⬜"} {name}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {expanded?.code === loc.location_code && expanded.type === "mis" && misData && (
                    <div className="section-check-grid" style={{ marginTop: "0.75rem" }}>
                      {misData.tabs.map((t) => (
                        <div key={t.key} className={`section-check ${t.complete ? "done" : "pending"}`}>
                          {t.complete ? "✅" : "⬜"} {t.label}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {revisionTarget && (
                <div className="sec-card">
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

              <h3 style={{ fontSize: "0.95rem", color: "var(--navy-deep)", marginTop: "1.5rem" }}>⬇ Downloads</h3>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                <button onClick={() => api.exportSubmittedData(monthYear)} className="btn btn-save" style={{ fontSize: "0.85rem" }}>
                  ⬇ Submitted Data (.xlsx)
                </button>
                <button onClick={() => api.exportPendingList(monthYear)} className="btn btn-save" style={{ fontSize: "0.85rem" }}>
                  ⬇ Pending Locations (.xlsx)
                </button>
                <button onClick={() => api.exportTankMaster()} className="btn btn-save" style={{ fontSize: "0.85rem" }}>
                  ⬇ Tank Master (.xlsx)
                </button>
              </div>
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
          </>
        )}
      </main>
    </div>
  );
}
