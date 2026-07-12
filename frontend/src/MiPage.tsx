import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import type { MiStatusResponse } from "./api";
import { MiTabEditor } from "./MiTabEditor";

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
    onAnySaved?.();
  }, [locationCode, monthYear, onAnySaved]);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  if (!status) return <p>Loading M&I status...</p>;

  return (
    <div>
      <h2 style={{ marginBottom: "0.25rem", color: "var(--navy-deep)" }}>Section 5A — Maintenance &amp; Inspection</h2>
      <p style={{ color: "var(--text-muted)" }}>
        <span className={`status-pill ${status.allComplete ? "submitted" : "not-started"}`}>
          {status.allComplete ? "All 10 M&I tabs complete" : "Not all M&I tabs complete"}
        </span>{" "}
        every tab must be either filled in or marked Not Applicable before this month can be submitted for review.
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
            {t.complete ? "✅" : "⬜"} {t.label}
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
          onSaved={refreshStatus}
        />
      )}
    </div>
  );
}
