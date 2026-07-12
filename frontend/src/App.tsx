import { useCallback, useEffect, useState } from "react";
import { AuthProvider, useAuth } from "./AuthContext";
import { LoginPage } from "./LoginPage";
import { SectionForm } from "./SectionForm";
import { SectionNav } from "./SectionNav";
import type { NavSelection } from "./SectionNav";
import { WorkflowBar } from "./WorkflowBar";
import { DetailTableEditor } from "./DetailTableEditor";
import { MiPage } from "./MiPage";
import { ZoneDashboard } from "./ZoneDashboard";
import { AdminDashboard } from "./AdminDashboard";
import { HelpdeskWidget } from "./HelpdeskWidget";
import { api } from "./api";
import type { SubmissionResponse } from "./api";

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function Dashboard() {
  const { user, logout } = useAuth();
  const [monthYear, setMonthYear] = useState(currentMonthKey());
  const [selection, setSelection] = useState<NavSelection>(1);
  const [summary, setSummary] = useState<SubmissionResponse | null>(null);
  const [miAllComplete, setMiAllComplete] = useState(false);
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
      .then((res) => setMiAllComplete(res.allComplete))
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
      <main style={{ padding: "2rem", fontFamily: "sans-serif" }}>
        <p>
          Logged in as <strong>{user?.loginCode}</strong> ({user?.role}) — this role doesn't have a data-entry
          section yet in this build.
        </p>
        <button onClick={logout}>Log out</button>
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

  return (
    <main style={{ maxWidth: 1100, margin: "2rem auto", fontFamily: "sans-serif", padding: "0 1rem" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "1.3rem" }}>SOD eMIS</h1>
          <p style={{ margin: 0, color: "#555" }}>
            {locationCode} · {user!.role}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <label>
            Month: <input type="month" value={monthYear} onChange={(e) => setMonthYear(e.target.value)} />
          </label>
          <HelpdeskWidget />
          <button onClick={logout}>Log out</button>
        </div>
      </header>

      {summary && (
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
      )}

      <div style={{ display: "flex", gap: "1.5rem", alignItems: "flex-start" }}>
        <SectionNav
          sectionsComplete={summary?.sectionsComplete ?? {}}
          miComplete={miAllComplete}
          selected={selection}
          onSelect={setSelection}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          {selection === "MI" ? (
            <MiPage locationCode={locationCode} monthYear={monthYear} disabled={disabled} onAnySaved={refreshAll} />
          ) : (
            <>
              <SectionForm
                locationCode={locationCode}
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
      </div>
    </main>
  );
}

function AppContent() {
  const { user, loading } = useAuth();
  if (loading) return <p style={{ padding: "2rem", fontFamily: "sans-serif" }}>Loading...</p>;
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
