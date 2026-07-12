import { fyLabel, fyMonthOptions, fyStartYearOf, fyStartYearOptions } from "./fyUtils";
import type { SubmissionStatus } from "./api";

const STATUS_ICON: Record<SubmissionStatus, string> = {
  NOT_STARTED: "⚪",
  IN_PROGRESS: "🔵",
  PENDING_REVIEW: "🟡",
  SUBMITTED: "✅",
  REJECTED: "❌",
};

export function FyMonthPicker({
  monthYear,
  onChange,
  monthStatuses,
}: {
  monthYear: string;
  onChange: (monthYear: string) => void;
  monthStatuses?: Record<string, SubmissionStatus>;
}) {
  const fyStart = fyStartYearOf(monthYear);
  const months = fyMonthOptions(fyStart);

  function optionLabel(m: { value: string; label: string }): string {
    const status = monthStatuses?.[m.value];
    if (!status) return m.label;
    const locked = status === "SUBMITTED" || status === "PENDING_REVIEW" ? " 🔒" : "";
    return `${STATUS_ICON[status]} ${m.label}${locked}`;
  }

  function changeFy(newFyStart: number) {
    const idx = months.findIndex((m) => m.value === monthYear);
    const newMonths = fyMonthOptions(newFyStart);
    onChange(newMonths[idx === -1 ? 0 : idx].value);
  }

  return (
    <div style={{ display: "flex", gap: "1.75rem", flex: 1 }}>
      <label className="fy-field">
        <div className="fy-field-label">Financial Year</div>
        <select value={fyStart} onChange={(e) => changeFy(Number(e.target.value))}>
          {fyStartYearOptions(fyStart).map((y) => (
            <option key={y} value={y}>
              {fyLabel(y)}
            </option>
          ))}
        </select>
      </label>
      <label className="fy-field" style={{ flex: 1 }}>
        <div className="fy-field-label">Month</div>
        <select value={monthYear} onChange={(e) => onChange(e.target.value)} style={{ width: "100%" }}>
          {months.map((m) => (
            <option key={m.value} value={m.value}>
              {optionLabel(m)}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
