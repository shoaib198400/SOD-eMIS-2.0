import { useState } from "react";
import { AuthProvider, useAuth } from "./AuthContext";
import { LoginPage } from "./LoginPage";
import { SectionForm } from "./SectionForm";

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function Dashboard() {
  const { user, logout } = useAuth();
  const [monthYear, setMonthYear] = useState(currentMonthKey());

  if (!user?.locationCode) {
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

  return (
    <main style={{ maxWidth: 900, margin: "2rem auto", fontFamily: "sans-serif", padding: "0 1rem" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "1.3rem" }}>SOD eMIS</h1>
          <p style={{ margin: 0, color: "#555" }}>
            {user.locationCode} · {user.role}
          </p>
        </div>
        <div>
          <label style={{ marginRight: "1rem" }}>
            Month:{" "}
            <input type="month" value={monthYear} onChange={(e) => setMonthYear(e.target.value)} />
          </label>
          <button onClick={logout}>Log out</button>
        </div>
      </header>
      <SectionForm locationCode={user.locationCode} monthYear={monthYear} sectionNo={1} />
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
