import { useState } from "react";
import type { SubmissionStatus } from "./api";

const STATUS_LABELS: Record<SubmissionStatus, string> = {
  NOT_STARTED: "Not Started",
  IN_PROGRESS: "In Progress",
  PENDING_REVIEW: "Pending Review",
  SUBMITTED: "Submitted & Locked",
  REJECTED: "Rejected — needs revision",
};

export function WorkflowBar({
  status,
  completionPct,
  checkerNotes,
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
  checkerNotes: string | null;
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

  return (
    <div style={{ border: "1px solid #ccc", borderRadius: 6, padding: "0.75rem 1rem", marginBottom: "1rem" }}>
      <p style={{ margin: 0 }}>
        Status: <strong>{STATUS_LABELS[status]}</strong> · Overall completion: {completionPct}%
      </p>
      {checkerNotes && <p style={{ margin: "0.25rem 0", color: "#b45309" }}>Checker notes: {checkerNotes}</p>}
      {error && <p style={{ color: "crimson" }}>{error}</p>}

      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem", flexWrap: "wrap" }}>
        {canSubmit && (
          <button onClick={onSubmit} disabled={busy || completionPct < 100}>
            Submit for Review
          </button>
        )}
        {canApproveReject && (
          <>
            <button onClick={onApprove} disabled={busy}>
              Approve & Lock
            </button>
            <button onClick={() => setShowReject((v) => !v)} disabled={busy}>
              Reject to Maker
            </button>
          </>
        )}
        {(canMakerReset || canCheckerReset) && (
          <button onClick={() => setShowReset((v) => !v)} disabled={busy}>
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
            style={{ width: "100%", padding: "0.4rem" }}
          />
          <button
            onClick={() => {
              onReject(rejectNote);
              setRejectNote("");
              setShowReject(false);
            }}
            disabled={!rejectNote.trim() || busy}
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
            style={{ width: "100%", padding: "0.4rem" }}
          />
          <button
            onClick={() => {
              onReset(resetReason);
              setResetReason("");
              setShowReset(false);
            }}
            disabled={!resetReason.trim() || busy}
          >
            Confirm Reset (clears all sections for this month)
          </button>
        </div>
      )}
    </div>
  );
}
