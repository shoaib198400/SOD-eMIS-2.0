import { useState } from "react";
import { api } from "./api";

export function HelpdeskWidget() {
  const [open, setOpen] = useState(false);
  const [issueType, setIssueType] = useState("");
  const [issueDesc, setIssueDesc] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    try {
      await api.fileHelpdeskTicket(issueType, issueDesc);
      setSent(true);
      setIssueType("");
      setIssueDesc("");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setOpen((v) => !v)} className="nav-btn">
        🆘 Helpdesk
      </button>
      {open && (
        <div
          className="dash-card"
          style={{ position: "fixed", left: 250, bottom: "1rem", width: 280, zIndex: 50, color: "var(--text-body)" }}
        >
          {sent ? (
            <p>Your ticket was submitted. An admin will respond soon.</p>
          ) : (
            <>
              <input
                placeholder="Issue type (e.g. Login Issue)"
                value={issueType}
                onChange={(e) => setIssueType(e.target.value)}
                style={{ width: "100%", marginBottom: "0.4rem" }}
              />
              <textarea
                placeholder="Describe the issue"
                value={issueDesc}
                onChange={(e) => setIssueDesc(e.target.value)}
                style={{ width: "100%", minHeight: 60 }}
              />
              {error && <p style={{ color: "var(--red)" }}>{error}</p>}
              <button onClick={submit} disabled={!issueType.trim() || !issueDesc.trim()} className="btn btn-primary" style={{ marginTop: "0.4rem" }}>
                Submit Ticket
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
