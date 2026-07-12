import { useState } from "react";
import type { SubmissionStatus } from "./api";

const STATUS_LABELS: Record<SubmissionStatus, string> = {
  NOT_STARTED: "Not Started",
  IN_PROGRESS: "In Progress",
  PENDING_REVIEW: "Pending Review",
  SUBMITTED: "Submitted & Locked",
  REJECTED: "Rejected — needs revision",
};

const STATUS_PILL_CLASS: Record<SubmissionStatus, string> = {
  NOT_STARTED: "not-started",
  IN_PROGRESS: "in-progress",
  PENDING_REVIEW: "pending-review",
  SUBMITTED: "submitted",
  REJECTED: "rejected",
};

// Status pill + checker notes — shown near the top of the dashboard, next to the KPI strip.
export function WorkflowNotice({
  status,
  completionPct,
  checkerNotes,
}: {
  status: SubmissionStatus;
  completionPct: number;
  checkerNotes: string | null;
}) {
  return (
    <div>
      <p style={{ margin: 0 }}>
        <span className={`status-pill ${STATUS_PILL_CLASS[status]}`}>{STATUS_LABELS[status]}</span>{" "}
        <span style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>Overall completion: {completionPct}%</span>
      </p>
      {checkerNotes && <p style={{ margin: "0.5rem 0 0", color: "#92400e" }}>Checker notes: {checkerNotes}</p>}
    </div>
  );
}

// Submit/Approve/Reject/Reset buttons — rendered at the bottom of the dashboard, right after
// the section-completion checklist, matching the original app's page order.
export function WorkflowActions({
  status,
  completionPct,
  role,
  busy,
  error,
  onSubmit,
  onApprove,
  onReject,
  onReset,
}: {
  status: SubmissionStatus;
  completionPct: number;
  role: string;
  busy: boolean;
  error: string | null;
  onSubmit: () => void;
  onApprove: () => void;
  onReject: (note: string) => void;
  onReset: (reason: string) => void;
}) {
  const [rejectNote, setRejectNote] = useState("");
  const [resetReason, setResetReason] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [showReset, setShowReset] = useState(false);

  const canSubmit = role === "Maker" && ["NOT_STARTED", "IN_PROGRESS", "REJECTED"].includes(status);
  const canApproveReject = role === "Checker" && status === "PENDING_REVIEW";
  const canMakerReset = role === "Maker" && !["SUBMITTED", "PENDING_REVIEW"].includes(status);
  const canCheckerReset = role === "Checker" && status !== "SUBMITTED";

  if (!canSubmit && !canApproveReject && !canMakerReset && !canCheckerReset) return null;

  return (
    <div style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid #e5e7eb" }}>
      <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "0.5rem" }}>
        Actions
      </div>
      {error && <p style={{ color: "var(--red)" }}>{error}</p>}

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        {canSubmit && (
          <button onClick={onSubmit} disabled={busy || completionPct < 100} className="btn btn-primary">
            📤 Submit for Review
          </button>
        )}
        {canApproveReject && (
          <>
            <button onClick={onApprove} disabled={busy} className="btn btn-approve">
              Approve &amp; Lock
            </button>
            <button onClick={() => setShowReject((v) => !v)} disabled={busy} className="btn btn-secondary">
              Reject to Maker
            </button>
          </>
        )}
        {(canMakerReset || canCheckerReset) && (
          <button onClick={() => setShowReset((v) => !v)} disabled={busy} className="btn btn-secondary">
            Reset Draft
          </button>
        )}
      </div>

      {showReject && (
        <div style={{ marginTop: "0.5rem" }}>
          <textarea
            placeholder="Reason for rejection (required)"
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
            style={{ width: "100%" }}
          />
          <button
            onClick={() => {
              onReject(rejectNote);
              setRejectNote("");
              setShowReject(false);
            }}
            disabled={!rejectNote.trim() || busy}
            className="btn btn-primary"
            style={{ marginTop: "0.4rem" }}
          >
            Confirm Reject
          </button>
        </div>
      )}

      {showReset && (
        <div style={{ marginTop: "0.5rem" }}>
          <textarea
            placeholder="Reason for reset (required)"
            value={resetReason}
            onChange={(e) => setResetReason(e.target.value)}
            style={{ width: "100%" }}
          />
          <button
            onClick={() => {
              onReset(resetReason);
              setResetReason("");
              setShowReset(false);
            }}
            disabled={!resetReason.trim() || busy}
            className="btn btn-secondary"
            style={{ marginTop: "0.4rem" }}
          >
            Confirm Reset (clears all sections for this month)
          </button>
        </div>
      )}
    </div>
  );
}
