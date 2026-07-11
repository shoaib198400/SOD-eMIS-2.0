import { useEffect, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

type HealthResponse = {
  ok: boolean;
  service: string;
  time: string;
};

function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/health`, { credentials: "include" })
      .then((res) => res.json())
      .then(setHealth)
      .catch((err) => setError(String(err)));
  }, []);

  return (
    <main style={{ fontFamily: "sans-serif", padding: "2rem" }}>
      <h1>SOD MIS — Rewrite Skeleton</h1>
      {error && <p style={{ color: "crimson" }}>Backend unreachable: {error}</p>}
      {health && (
        <p style={{ color: "seagreen" }}>
          Backend reachable: {health.service} @ {health.time}
        </p>
      )}
      {!health && !error && <p>Checking backend connection...</p>}
    </main>
  );
}

export default App;
