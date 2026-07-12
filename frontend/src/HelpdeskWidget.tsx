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
      <button onClick={() => setOpen((v) => !v)}>Help</button>
      {open && (
        <div style={{ position: "absolute", right: 0, top: "2rem", width: 280, background: "white", border: "1px solid #ccc", borderRadius: 6, padding: "0.75rem", zIndex: 10 }}>
          {sent ? (
            <p>Your ticket was submitted. An admin will respond soon.</p>
          ) : (
            <>
              <input
                placeholder="Issue type (e.g. Login Issue)"
                value={issueType}
                onChange={(e) => setIssueType(e.target.value)}
                style={{ width: "100%", padding: "0.4rem", marginBottom: "0.4rem" }}
              />
              <textarea
                placeholder="Describe the issue"
                value={issueDesc}
                onChange={(e) => setIssueDesc(e.target.value)}
                style={{ width: "100%", padding: "0.4rem", minHeight: 60 }}
              />
              {error && <p style={{ color: "crimson" }}>{error}</p>}
              <button onClick={submit} disabled={!issueType.trim() || !issueDesc.trim()}>
                Submit Ticket
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
