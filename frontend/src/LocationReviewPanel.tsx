import { useEffect, useState } from "react";
import { api } from "./api";
import type { SubmissionResponse, AllFieldDefsResponse } from "./api";
import { SECTION_NAMES } from "./sectionNames";
import { SectionForm } from "./SectionForm";
import { MiPage } from "./MiPage";
import { DetailTableEditor } from "./DetailTableEditor";

const STATUS_LABELS: Record<string, string> = {
  NOT_STARTED: "Not Started",
  IN_PROGRESS: "In Progress",
  PENDING_REVIEW: "Pending Review",
  SUBMITTED: "Submitted",
  REJECTED: "Needs Revision",
};

// Full read-only rendering of a location's month — all 10 sections with actual field
// values, plus M&I (under S5) and the detail tables (Railway Claims under S3, IRR/Legal
// under S10) — matching the original app's "View" / show_review page, which reuses the
// same section-rendering as the data-entry form just in disabled mode, rather than a
// separate simplified summary.
export function LocationReviewPanel({
  locationCode,
  locationName,
  monthYear,
  onClose,
}: {
  locationCode: string;
  locationName?: string | null;
  monthYear: string;
  onClose: () => void;
}) {
  const [summary, setSummary] = useState<SubmissionResponse | null>(null);
  const [allFieldDefs, setAllFieldDefs] = useState<AllFieldDefsResponse | null>(null);

  useEffect(() => {
    setSummary(null);
    setAllFieldDefs(null);
    api.getSubmission(locationCode, monthYear).then(setSummary);
    api.fieldDefsAll(locationCode).then(setAllFieldDefs);
  }, [locationCode, monthYear]);

  // Both fetched once here rather than letting each of the 10 SectionForms fetch them
  // independently — was firing ~60 requests and taking 15-30s to fully render.
  if (!summary || !allFieldDefs) {
    return (
      <div className="dash-card">
        <p>Loading…</p>
      </div>
    );
  }

  return (
    <div>
      <div className="dash-card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: "1.1rem", color: "var(--navy-deep)" }}>
            {locationName ?? locationCode} ({locationCode})
          </div>
          <div style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
            Period: {monthYear} &middot; Status: <strong>{STATUS_LABELS[summary.status]}</strong> &middot; Completion: {summary.completionPct}%
          </div>
        </div>
        <button onClick={onClose} className="btn btn-secondary">
          ← Back
        </button>
      </div>

      {Object.keys(SECTION_NAMES).map((num) => {
        const sectionNo = Number(num);
        return (
          <div key={sectionNo}>
            <SectionForm
              locationCode={locationCode}
              locationName={locationName}
              monthYear={monthYear}
              sectionNo={sectionNo}
              disabled
              preloadedSubmission={summary}
              preloadedFieldDefs={allFieldDefs.sections[sectionNo]}
            />
            {sectionNo === 3 && (
              <DetailTableEditor locationCode={locationCode} monthYear={monthYear} tableType="RAILWAY_CLAIM" disabled />
            )}
            {sectionNo === 5 && (
              <div className="dash-card">
                <MiPage locationCode={locationCode} monthYear={monthYear} disabled />
              </div>
            )}
            {sectionNo === 10 && (
              <>
                <DetailTableEditor locationCode={locationCode} monthYear={monthYear} tableType="IRR_DETAIL" disabled />
                <DetailTableEditor locationCode={locationCode} monthYear={monthYear} tableType="LEGAL_CASE" disabled />
              </>
            )}
          </div>
        );
      })}

      <div className="dash-card" style={{ textAlign: "center" }}>
        <button onClick={onClose} className="btn btn-secondary">
          ← Back
        </button>
      </div>
    </div>
  );
}
