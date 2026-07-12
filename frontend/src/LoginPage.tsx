import { useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "./AuthContext";
import { api } from "./api";
import loginBg from "./assets/brand/login_bg.png";

export function LoginPage() {
  const { login } = useAuth();
  const [loginCode, setLoginCode] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [forgotOpen, setForgotOpen] = useState(false);
  const [fpCode, setFpCode] = useState("");
  const [fpIssue, setFpIssue] = useState("");
  const [fpSubmitting, setFpSubmitting] = useState(false);
  const [fpResult, setFpResult] = useState<string | null>(null);

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

  async function handleForgotSubmit(e: FormEvent) {
    e.preventDefault();
    setFpSubmitting(true);
    try {
      await api.forgotPassword(fpCode, fpIssue);
      setFpResult("Your request has been sent to the Admin. You will be contacted shortly.");
      setFpCode("");
      setFpIssue("");
    } catch (err) {
      setFpResult((err as Error).message);
    } finally {
      setFpSubmitting(false);
    }
  }

  return (
    <div
      style={{
        height: "100vh",
        width: "100%",
        overflow: "hidden",
        backgroundImage: `url(${loginBg})`,
        backgroundSize: "cover",
        backgroundPosition: "left top",
        backgroundRepeat: "no-repeat",
        backgroundAttachment: "fixed",
      }}
    >
      <div
        style={{
          position: "fixed",
          left: "68vw",
          right: "1vw",
          top: "4vh",
          bottom: "10vh",
          width: "auto",
          maxWidth: 400,
          minWidth: 270,
          margin: "0 auto",
          background: "white",
          borderTop: "5px solid #E53935",
          borderRadius: 14,
          overflowY: "auto",
          overflowX: "hidden",
          padding: "0 18px 12px",
          boxShadow: "0 12px 56px rgba(0,20,80,0.38)",
        }}
      >
        <div style={{ textAlign: "center", padding: "12px 8px 6px" }}>
          <div
            style={{
              width: 54,
              height: 54,
              background: "linear-gradient(145deg,#001F5E 0%,#003087 100%)",
              borderRadius: "50%",
              margin: "0 auto 12px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 0 0 4px rgba(204,0,0,0.20), 0 4px 18px rgba(0,31,94,0.42)",
            }}
          >
            <svg viewBox="0 0 24 24" width="25" height="25" fill="white">
              <path d="M18 8h-1V6A5 5 0 0 0 7 6v2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2z M12 17a2 2 0 1 1 0-4 2 2 0 0 1 0 4z M15.1 8H8.9V6a3.1 3.1 0 0 1 6.2 0v2z" />
            </svg>
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#001F5E", marginBottom: 5, letterSpacing: "0.3px" }}>Sign In</div>
          <div style={{ width: 42, height: 3, background: "linear-gradient(90deg,#E53935,#EF5350)", borderRadius: 2, margin: "0 auto 9px" }} />
          <div style={{ fontSize: 11, color: "#003087", opacity: 0.75, fontWeight: 500, letterSpacing: "0.4px", marginBottom: 2 }}>
            HPCL SOD e-MIS &nbsp;&bull;&nbsp; Authorised Users Only
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <label style={{ display: "block", marginBottom: 2 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#001F5E", letterSpacing: "0.8px", textTransform: "uppercase" }}>
              User ID
            </div>
            <input
              value={loginCode}
              onChange={(e) => setLoginCode(e.target.value)}
              placeholder="Enter your User ID"
              maxLength={20}
              autoFocus
              style={{
                width: "100%",
                border: "2px solid #c0cce8",
                borderRadius: 8,
                padding: "10px 14px",
                fontSize: 13,
                color: "#001F5E",
                background: "#ffffff",
                fontWeight: 500,
              }}
            />
          </label>
          <label style={{ display: "block", marginTop: 8, marginBottom: 2 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#001F5E", letterSpacing: "0.8px", textTransform: "uppercase" }}>
              Password
            </div>
            <div style={{ position: "relative" }}>
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                style={{
                  width: "100%",
                  border: "2px solid #c0cce8",
                  borderRadius: 8,
                  padding: "10px 40px 10px 14px",
                  fontSize: 13,
                  color: "#001F5E",
                  background: "#ffffff",
                  fontWeight: 500,
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                style={{
                  all: "unset",
                  position: "absolute",
                  right: 10,
                  top: "50%",
                  transform: "translateY(-50%)",
                  cursor: "pointer",
                  fontSize: 15,
                  lineHeight: 1,
                  color: "#5b6b8c",
                }}
              >
                {showPassword ? "🙈" : "👁"}
              </button>
            </div>
          </label>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
            <label style={{ fontSize: 12, color: "#001F5E", fontWeight: 600 }}>
              <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} /> Remember me
            </label>
            <button
              type="button"
              onClick={() => setForgotOpen((v) => !v)}
              style={{
                all: "unset",
                color: "#E53935",
                fontStyle: "italic",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Forgot Password?
            </button>
          </div>

          {error && (
            <p style={{ color: "#E53935", fontSize: "0.85rem", margin: "0.5rem 0 0" }}>{error}</p>
          )}

          <div style={{ height: 4 }} />
          <button
            type="submit"
            disabled={submitting}
            style={{
              width: "100%",
              marginTop: 8,
              background: "linear-gradient(135deg,#001640 0%,#001F5E 40%,#003087 80%,#0044bb 100%)",
              color: "white",
              border: "none",
              borderRadius: 9,
              fontWeight: 800,
              fontSize: 13,
              letterSpacing: "2px",
              textTransform: "uppercase",
              padding: "12px 20px",
              boxShadow: "0 4px 18px rgba(0,31,94,0.40)",
              cursor: submitting ? "default" : "pointer",
              opacity: submitting ? 0.7 : 1,
            }}
          >
            {submitting ? "Verifying..." : "🔑 Login"}
          </button>
        </form>

        {forgotOpen && (
          <form onSubmit={handleForgotSubmit} style={{ marginTop: 14, paddingTop: 10, borderTop: "1px solid #e0e6f0" }}>
            {fpResult ? (
              <p style={{ fontSize: 13, color: "#001F5E" }}>{fpResult}</p>
            ) : (
              <>
                <label style={{ display: "block", marginBottom: 6 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#001F5E", textTransform: "uppercase" }}>User ID</div>
                  <input
                    value={fpCode}
                    onChange={(e) => setFpCode(e.target.value)}
                    placeholder="Your User ID (e.g. 1424)"
                    maxLength={20}
                    style={{ width: "100%", border: "2px solid #c0cce8", borderRadius: 8, padding: "8px 12px", fontSize: 13 }}
                  />
                </label>
                <label style={{ display: "block", marginBottom: 6 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#001F5E", textTransform: "uppercase" }}>Describe your issue</div>
                  <textarea
                    value={fpIssue}
                    onChange={(e) => setFpIssue(e.target.value)}
                    placeholder="e.g. I forgot my password and need it reset."
                    maxLength={400}
                    style={{ width: "100%", minHeight: 70, border: "2px solid #c0cce8", borderRadius: 8, padding: "8px 12px", fontSize: 13 }}
                  />
                </label>
                <button
                  type="submit"
                  disabled={fpSubmitting || !fpCode.trim() || !fpIssue.trim()}
                  style={{
                    width: "100%",
                    background: "#1565C0",
                    color: "white",
                    border: "none",
                    borderRadius: 9,
                    fontWeight: 700,
                    fontSize: 13,
                    padding: "10px",
                  }}
                >
                  {fpSubmitting ? "Sending..." : "📨 Submit"}
                </button>
              </>
            )}
          </form>
        )}
      </div>

      <div
        style={{
          position: "fixed",
          bottom: "2.2vh",
          right: "2.2vw",
          fontSize: "10.5px",
          color: "rgba(210,225,245,0.88)",
          textAlign: "right",
          pointerEvents: "none",
          fontFamily: "'Segoe UI', Arial, sans-serif",
          letterSpacing: "0.2px",
        }}
      >
        &copy; 2026 Hindustan Petroleum Corporation Limited.&nbsp;&nbsp;All rights reserved.
      </div>
    </div>
  );
}
