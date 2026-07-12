import { useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "./AuthContext";
import loginBg from "./assets/brand/login_bg.png";

export function LoginPage() {
  const { login } = useAuth();
  const [loginCode, setLoginCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(loginCode, password);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        backgroundImage: `linear-gradient(160deg, #001f5e 0%, #003087 100%), url(${loginBg})`,
        backgroundBlendMode: "overlay",
        backgroundSize: "cover",
        backgroundPosition: "center",
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
      }}
    >
      <div
        className="dash-card"
        style={{
          maxWidth: 400,
          minWidth: 270,
          width: "90%",
          marginRight: "6vw",
          borderTop: "5px solid var(--red)",
          boxShadow: "var(--shadow-deep)",
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: "50%",
            margin: "0 auto 0.75rem",
            background: "linear-gradient(145deg, var(--navy-deep) 0%, var(--navy-mid) 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 0 0 6px rgba(204,0,0,0.20)",
          }}
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
            <rect x="4" y="11" width="16" height="9" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
        </div>
        <h1 style={{ fontSize: "1.3rem", margin: "0 0 0.4rem", color: "var(--navy-deep)" }}>Sign In</h1>
        <div
          style={{
            width: 60,
            height: 3,
            margin: "0 auto 0.6rem",
            borderRadius: 2,
            background: "linear-gradient(90deg, var(--red), var(--red-light))",
          }}
        />
        <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: "0 0 1.25rem" }}>
          HPCL SOD e-MIS &middot; Authorised Users Only
        </p>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.85rem", textAlign: "left" }}>
          <label>
            <div style={{ fontSize: "0.8rem", color: "var(--navy-deep)", marginBottom: "0.25rem" }}>Location / Login Code</div>
            <input value={loginCode} onChange={(e) => setLoginCode(e.target.value)} style={{ display: "block", width: "100%" }} autoFocus />
          </label>
          <label>
            <div style={{ fontSize: "0.8rem", color: "var(--navy-deep)", marginBottom: "0.25rem" }}>Password</div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ display: "block", width: "100%" }}
            />
          </label>
          {error && <p style={{ color: "var(--red)", margin: 0, fontSize: "0.85rem" }}>{error}</p>}
          <button type="submit" disabled={submitting} className="btn btn-save" style={{ width: "100%", marginTop: "0.25rem" }}>
            {submitting ? "Logging in..." : "Login"}
          </button>
        </form>
      </div>
    </div>
  );
}
