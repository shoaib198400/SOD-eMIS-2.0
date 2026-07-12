import type { ReactNode } from "react";
import { SECTION_NAMES, SECTION_NAMES_SHORT } from "./sectionNames";
import { computeDeadline } from "./deadline";
import type { Urgency } from "./deadline";
import { api } from "./api";
import type { SubmissionResponse, MeResponse } from "./api";
import type { NavSelection } from "./SectionNav";

const STATUS_LABELS: Record<string, string> = {
  NOT_STARTED: "Not Started",
  IN_PROGRESS: "In Progress",
  PENDING_REVIEW: "Pending Review",
  SUBMITTED: "Submitted",
  REJECTED: "Needs Revision",
};

// Mirrors the original app's compute_deadline() banner exactly — shown in ALL 4 states,
// not just when overdue.
const BANNER_CONFIG: Record<Urgency, { gradient: string; icon: string; title: string }> = {
  overdue: { gradient: "linear-gradient(135deg, #b71c1c 0%, #c62828 100%)", icon: "⚠️", title: "OVERDUE" },
  urgent: { gradient: "linear-gradient(135deg, #ea580c 0%, #c2410c 100%)", icon: "🔴", title: "URGENT" },
  warning: { gradient: "linear-gradient(135deg, #1565c0 0%, #1976d2 100%)", icon: "⚠️", title: "DUE SOON" },
  ok: { gradient: "linear-gradient(135deg, #15803d 0%, #166534 100%)", icon: "✅", title: "ON TRACK" },
};

export function DashboardHome({
  user,
  monthYear,
  summary,
  onNavigate,
  actions,
}: {
  user: MeResponse;
  monthYear: string;
  summary: SubmissionResponse;
  onNavigate: (selection: NavSelection) => void;
  actions?: ReactNode;
}) {
  const deadline = computeDeadline(monthYear);
  const sectionsDone = Object.values(summary.sectionsComplete).filter(Boolean).length;
  const totalSections = Object.keys(SECTION_NAMES).length;
  const locked = summary.status === "SUBMITTED" || summary.status === "PENDING_REVIEW";
  const banner = BANNER_CONFIG[deadline.urgency];
  const pillLabel = deadline.daysLeft < 0 ? `${Math.abs(deadline.daysLeft)}d overdue` : `${deadline.daysLeft}d left`;

  return (
    <div>
      <div className="overdue-banner" style={{ background: banner.gradient }}>
        <span>
          {banner.icon} <strong>{banner.title}</strong> — MIS for <strong>{deadline.monthLabel}</strong>{" "}
          {deadline.urgency === "overdue"
            ? `was due on ${deadline.dateLabel} — ${Math.abs(deadline.daysLeft)} day(s) past deadline. Submit immediately!`
            : deadline.urgency === "urgent"
            ? `due on ${deadline.dateLabel} — only ${deadline.daysLeft} day(s) left!`
            : `due on ${deadline.dateLabel}. ${deadline.daysLeft} days remaining.`}
        </span>
        <span className="badge">{pillLabel}</span>
      </div>

      <div className="stat-row">
        <div className="stat-card">
          <div className="label">📅 Period</div>
          <div className="value" style={{ fontSize: "1.1rem" }}>
            {deadline.monthLabel}
          </div>
        </div>
        <div className="stat-card">
          <div className="label">📊 Status</div>
          <div className="value" style={{ fontSize: "1.1rem" }}>
            {STATUS_LABELS[summary.status]}
          </div>
        </div>
        <div className="stat-card">
          <div className="label">✅ Completion</div>
          <div className="value">{summary.completionPct}%</div>
        </div>
        <div className="stat-card">
          <div className="label">📋 Sections Done</div>
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
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "0.8rem", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                Completion Progress
                {locked && <span className="status-pill" style={{ background: "#ede9fe", color: "#5b21b6" }}>🔒 Locked</span>}
              </span>
              <span style={{ color: "var(--navy)" }}>{summary.completionPct}%</span>
            </div>
            <div className="progress-track">
              <div className={`progress-fill${summary.status === "SUBMITTED" ? " complete" : ""}`} style={{ width: `${summary.completionPct}%` }} />
            </div>

            <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "0.5rem" }}>
              Section Completion
            </div>
            <div className="section-check-grid">
              {Object.entries(SECTION_NAMES_SHORT).map(([num, name]) => {
                const sectionNo = Number(num);
                const done = summary.sectionsComplete[sectionNo];
                return (
                  <button key={sectionNo} onClick={() => onNavigate(sectionNo)} className={`section-check ${done ? "done" : "pending"}`}>
                    {done ? "✅" : "⬜"} {name.replace(" - ", " ")}
                  </button>
                );
              })}
            </div>
            {actions}
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
            <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
              Click the button below to open the full MIS Guidelines PDF with section-by-section instructions.
            </p>
            <a
              href="/MIS_Guidelines.pdf"
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary"
              style={{
                display: "block",
                width: "100%",
                textAlign: "center",
                marginBottom: "0.5rem",
                background: "white",
                color: "var(--text-body)",
                border: "1px solid var(--border-input)",
                boxShadow: "none",
                textDecoration: "none",
              }}
            >
              📄 Open MIS Guidelines PDF
            </a>
            <button
              onClick={() => api.exportMisTemplate(user.locationCode ?? "", monthYear)}
              className="btn btn-save"
              style={{ width: "100%" }}
            >
              📊 Excel Template
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
