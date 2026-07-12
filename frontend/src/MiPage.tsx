import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import type { MiStatusResponse } from "./api";
import { MiTabEditor } from "./MiTabEditor";
import { computeDeadline } from "./deadline";

const TAB_ICONS: Record<string, string> = {
  MI_TANK_OUTAGE: "🛢",
  MI_MAJOR_REPAIR: "🔧",
  MI_VRU: "♻️",
  MI_AUDIT_2526: "📋",
  MI_AUDIT_2627: "📋",
  MI_TECH_AUDIT: "🔍",
  MI_EQUIP_BREAKDOWN: "⚙️",
  MI_INT_PIPELINE: "🔗",
  MI_EXT_PIPELINE: "🔗",
  MI_TANK_STATUS: "📊",
};

export function MiPage({
  locationCode,
  monthYear,
  disabled,
  onAnySaved,
}: {
  locationCode: string;
  monthYear: string;
  disabled: boolean;
  onAnySaved?: () => void;
}) {
  const [status, setStatus] = useState<MiStatusResponse | null>(null);
  const [selectedTab, setSelectedTab] = useState<string | null>(null);

  const refreshStatus = useCallback(() => {
    api.getMiStatus(locationCode, monthYear).then((res) => {
      setStatus(res);
      setSelectedTab((prev) => prev ?? res.tabs[0]?.key ?? null);
    });
  }, [locationCode, monthYear]);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  function handleTabSaved() {
    refreshStatus();
    onAnySaved?.();
  }

  if (!status) return <p>Loading M&I status...</p>;

  const monthLabel = computeDeadline(monthYear).monthLabel;

  return (
    <div>
      <div className="dash-card" style={{ marginBottom: "1rem" }}>
        <div style={{ fontWeight: 700, color: "var(--navy-deep)" }}>M&amp;I MIS — {monthLabel}</div>
        <div style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>Maintenance &amp; Inspection Monthly Information System</div>
      </div>

      <div className="deadline-callout" style={{ marginBottom: "1rem" }}>
        ⚠ <strong>How to complete all 10 sections:</strong>
        <br />
        For each section that applies to your location, enter the relevant data and save. For sections that don't
        apply, tick the <strong>Not Applicable</strong> checkbox inside the tab. All 10 sections must be complete
        before this month can be submitted for review.
      </div>

      <p style={{ color: "var(--text-muted)", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
        <span>
          <span className={`status-pill ${status.allComplete ? "submitted" : "not-started"}`}>
            {status.allComplete ? "All 10 M&I tabs complete" : "Not all M&I tabs complete"}
          </span>{" "}
          every tab must be either filled in or marked Not Applicable before this month can be submitted for review.
        </span>
        <button
          onClick={() => api.exportMiReport(locationCode, monthYear)}
          disabled={!status.allComplete}
          className="btn btn-save"
          style={{ fontSize: "0.85rem" }}
        >
          📊 Generate M&amp;I Report
        </button>
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "1rem" }}>
        {status.tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setSelectedTab(t.key)}
            className="btn btn-secondary"
            style={{
              padding: "0.4rem 0.7rem",
              fontSize: "0.85rem",
              opacity: selectedTab === t.key ? 1 : 0.55,
              boxShadow: "none",
            }}
          >
            <span style={{ background: t.complete ? "#16a34a" : "#9ca3af", borderRadius: 4, padding: "0 0.3rem", marginRight: "0.3rem" }}>
              {t.complete ? "✓" : "✕"}
            </span>
            {TAB_ICONS[t.key] ?? ""} {t.label}
          </button>
        ))}
      </div>

      {selectedTab && (
        <MiTabEditor
          key={selectedTab}
          locationCode={locationCode}
          monthYear={monthYear}
          tabKey={selectedTab}
          disabled={disabled}
          onSaved={handleTabSaved}
        />
      )}
    </div>
  );
}
