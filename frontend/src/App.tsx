import { useCallback, useEffect, useState } from "react";
import { AuthProvider, useAuth } from "./AuthContext";
import { LoginPage } from "./LoginPage";
import { SectionForm } from "./SectionForm";
import { SectionNav } from "./SectionNav";
import type { NavSelection } from "./SectionNav";
import { DashboardHome } from "./DashboardHome";
import { WorkflowBar } from "./WorkflowBar";
import { DetailTableEditor } from "./DetailTableEditor";
import { MiPage } from "./MiPage";
import { ZoneDashboard } from "./ZoneDashboard";
import { AdminDashboard } from "./AdminDashboard";
import { HelpdeskWidget } from "./HelpdeskWidget";
import { api } from "./api";
import type { SubmissionResponse } from "./api";
import sideLogo from "./assets/brand/side_logo.png";
import titleBanner from "./assets/brand/title_banner.png";

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function Dashboard() {
  const { user, logout } = useAuth();
  const [monthYear, setMonthYear] = useState(currentMonthKey());
  const [selection, setSelection] = useState<NavSelection>("DASHBOARD");
  const [summary, setSummary] = useState<SubmissionResponse | null>(null);
  const [miAllComplete, setMiAllComplete] = useState(false);
  const [tankOpts, setTankOpts] = useState<string[]>([]);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const locationCode = user?.locationCode ?? null;

  const refreshAll = useCallback(() => {
    if (!locationCode) return;
    api
      .getSubmission(locationCode, monthYear)
      .then(setSummary)
      .catch((e) => setActionError((e as Error).message));
    api
      .getMiStatus(locationCode, monthYear)
      .then((res) => {
        setMiAllComplete(res.allComplete);
        setTankOpts(res.tankOpts.filter((t) => t !== "Other Tanks"));
      })
      .catch(() => undefined);
  }, [locationCode, monthYear]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  if (user?.role === "Zone") {
    return <ZoneDashboard />;
  }
  if (user?.role === "Admin") {
    return <AdminDashboard />;
  }

  if (!locationCode) {
    return (
      <main style={{ padding: "2rem" }}>
        <p>
          Logged in as <strong>{user?.loginCode}</strong> ({user?.role}) — this role doesn't have a data-entry
          section yet in this build.
        </p>
        <button className="btn btn-secondary" onClick={logout}>
          Log out
        </button>
      </main>
    );
  }

  const isMaker = user!.role === "Maker";
  const disabled = !isMaker || summary?.status === "SUBMITTED" || summary?.status === "PENDING_REVIEW";

  async function runAction(action: () => Promise<{ status: SubmissionResponse["status"] }>) {
    setActionBusy(true);
    setActionError(null);
    try {
      await action();
      refreshAll();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setActionBusy(false);
    }
  }

  function downloadTankMaster() {
    const csv = ["tank_no", ...tankOpts].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tank_master_${locationCode}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <img src={sideLogo} className="side-logo" alt="" />
        {selection === "MI" ? (
          <>
            <button onClick={() => setSelection("DASHBOARD")} className="nav-btn">
              🏠 Back to Dashboard
            </button>
            <div style={{ color: "white", fontWeight: 700, marginTop: "0.75rem" }}>M&amp;I MIS</div>
            <div style={{ color: "rgba(255,255,255,0.75)", fontSize: "0.8rem", marginBottom: "0.75rem" }}>
              Maintenance &amp; Inspection Data
            </div>
            <div style={{ fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.6px", color: "rgba(255,255,255,0.6)", margin: "0.4rem 0 0.2rem 0.3rem" }}>
              Tank Master
            </div>
            <button onClick={downloadTankMaster} className="nav-btn" disabled={tankOpts.length === 0}>
              ⬇ Download Tank Master
            </button>
          </>
        ) : (
          <SectionNav
            sectionsComplete={summary?.sectionsComplete ?? {}}
            miComplete={miAllComplete}
            selected={selection}
            onSelect={setSelection}
          />
        )}
      </aside>

      <main className="app-main">
        <header className="app-header">
          <div>
            <div style={{ fontWeight: 700, fontSize: "1.1rem" }}>HPCL SOD — MIS Entry Portal</div>
            <div style={{ fontSize: "0.8rem", opacity: 0.85 }}>Supply, Operations &amp; Distribution</div>
          </div>
          <img src={titleBanner} className="title-banner" alt="" />
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <input
              type="month"
              value={monthYear}
              onChange={(e) => setMonthYear(e.target.value)}
              style={{ background: "white" }}
            />
            <HelpdeskWidget />
            <span className="location-pill">
              📍 {user!.locationName ?? locationCode} | {user!.role}
            </span>
            <button className="btn-logout" onClick={logout}>
              ↪ Logout
            </button>
          </div>
        </header>

        {summary && (
          <div className="dash-card">
            <WorkflowBar
              status={summary.status}
              completionPct={summary.completionPct}
              checkerNotes={summary.checkerNotes}
              role={user!.role}
              busy={actionBusy}
              error={actionError}
              onSubmit={() => runAction(() => api.submit(locationCode, monthYear))}
              onApprove={() => runAction(() => api.approve(locationCode, monthYear))}
              onReject={(note) => runAction(() => api.reject(locationCode, monthYear, note))}
              onReset={(reason) => runAction(() => api.reset(locationCode, monthYear, reason))}
            />
          </div>
        )}

        {selection === "DASHBOARD" ? (
          summary && <DashboardHome user={user!} monthYear={monthYear} summary={summary} miAllComplete={miAllComplete} onNavigate={setSelection} />
        ) : (
          <div className="dash-card">
            {selection === "MI" ? (
              <MiPage locationCode={locationCode} monthYear={monthYear} disabled={disabled} onAnySaved={refreshAll} />
            ) : (
              <>
                <SectionForm
                  locationCode={locationCode}
                  locationName={user!.locationName}
                  monthYear={monthYear}
                  sectionNo={selection}
                  disabled={disabled}
                  onSaved={refreshAll}
                />
                {selection === 3 && (
                  <DetailTableEditor locationCode={locationCode} monthYear={monthYear} tableType="RAILWAY_CLAIM" disabled={disabled} />
                )}
                {selection === 10 && (
                  <>
                    <DetailTableEditor locationCode={locationCode} monthYear={monthYear} tableType="IRR_DETAIL" disabled={disabled} />
                    <DetailTableEditor locationCode={locationCode} monthYear={monthYear} tableType="LEGAL_CASE" disabled={disabled} />
                  </>
                )}
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function AppContent() {
  const { user, loading } = useAuth();
  if (loading) return <p style={{ padding: "2rem" }}>Loading...</p>;
  return user ? <Dashboard /> : <LoginPage />;
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
