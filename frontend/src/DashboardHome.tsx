import { SECTION_NAMES } from "./sectionNames";
import { computeDeadline } from "./deadline";
import type { SubmissionResponse, MeResponse } from "./api";
import type { NavSelection } from "./SectionNav";

const STATUS_LABELS: Record<string, string> = {
  NOT_STARTED: "Not Started",
  IN_PROGRESS: "In Progress",
  PENDING_REVIEW: "Pending Review",
  SUBMITTED: "Submitted",
  REJECTED: "Needs Revision",
};

export function DashboardHome({
  user,
  monthYear,
  summary,
  miAllComplete,
  onNavigate,
}: {
  user: MeResponse;
  monthYear: string;
  summary: SubmissionResponse;
  miAllComplete: boolean;
  onNavigate: (selection: NavSelection) => void;
}) {
  const deadline = computeDeadline(monthYear);
  const sectionsDone = Object.values(summary.sectionsComplete).filter(Boolean).length;
  const totalSections = Object.keys(SECTION_NAMES).length;
  const showOverdueBanner = summary.status !== "SUBMITTED" && (deadline.urgency === "overdue" || deadline.urgency === "urgent");

  return (
    <div>
      {showOverdueBanner && (
        <div className="overdue-banner">
          <span>
            ⚠️ {deadline.urgency === "overdue" ? "OVERDUE" : "URGENT"} — MIS for {deadline.monthLabel} was due on{" "}
            {deadline.dateLabel}
            {deadline.daysLeft < 0
              ? ` (${Math.abs(deadline.daysLeft)} day(s) overdue)`
              : ` (${deadline.daysLeft} day(s) left)`}
            . Submit immediately!
          </span>
          <span className="badge">
            {deadline.daysLeft < 0 ? `${Math.abs(deadline.daysLeft)}d overdue` : `${deadline.daysLeft}d left`}
          </span>
        </div>
      )}

      <div className="stat-row">
        <div className="stat-card">
          <div className="label">Period</div>
          <div className="value" style={{ fontSize: "1.1rem" }}>
            {deadline.monthLabel}
          </div>
        </div>
        <div className="stat-card">
          <div className="label">Status</div>
          <div className="value" style={{ fontSize: "1.1rem" }}>
            {STATUS_LABELS[summary.status]}
          </div>
        </div>
        <div className="stat-card">
          <div className="label">Completion</div>
          <div className="value">{summary.completionPct}%</div>
        </div>
        <div className="stat-card">
          <div className="label">Sections Done</div>
          <div className="value">
            {sectionsDone}/{totalSections}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: "1.25rem", alignItems: "flex-start" }}>
        <div className="status-card" style={{ flex: 2 }}>
          <div className="status-card-header">
            <div>
              <div style={{ fontWeight: 700, fontSize: "1.1rem" }}>{user.locationName ?? user.locationCode}</div>
              <div style={{ fontSize: "0.85rem", opacity: 0.85 }}>
                Zone: {user.zoneName ?? "—"} &nbsp;&bull;&nbsp; Period: {deadline.monthLabel}
              </div>
            </div>
            <span className={`status-pill ${summary.status.toLowerCase().replace("_", "-")}`}>
              {STATUS_LABELS[summary.status]}
            </span>
          </div>
          <div className="status-card-body">
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>
              <span>Completion Progress</span>
              <span style={{ color: "var(--navy)" }}>{summary.completionPct}%</span>
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${summary.completionPct}%` }} />
            </div>

            <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "0.5rem" }}>
              Section Completion
            </div>
            <div className="section-check-grid">
              {Object.entries(SECTION_NAMES).map(([num, name]) => {
                const sectionNo = Number(num);
                const done = summary.sectionsComplete[sectionNo];
                return (
                  <button key={sectionNo} onClick={() => onNavigate(sectionNo)} className={`section-check ${done ? "done" : "pending"}`}>
                    {done ? "✅" : "⬜"} {name}
                  </button>
                );
              })}
              <button onClick={() => onNavigate("MI")} className={`section-check ${miAllComplete ? "done" : "pending"}`}>
                {miAllComplete ? "✅" : "⬜"} S5A — M&amp;I MIS
              </button>
            </div>
          </div>
        </div>

        <div className="guideline-card" style={{ flex: 1 }}>
          <div className="guideline-header">📄 MIS Guidelines</div>
          <div className="guideline-body">
            Complete instructions for filling all 10 sections &amp; submission rules.
            <div className="deadline-callout">
              📅 <strong>Submission Deadline</strong>
              <br />
              Submit by the 5th of every month for the preceding month.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
