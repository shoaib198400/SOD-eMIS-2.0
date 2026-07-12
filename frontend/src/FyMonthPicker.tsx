import { fyLabel, fyMonthOptions, fyStartYearOf, fyStartYearOptions } from "./fyUtils";

export function FyMonthPicker({ monthYear, onChange }: { monthYear: string; onChange: (monthYear: string) => void }) {
  const fyStart = fyStartYearOf(monthYear);
  const months = fyMonthOptions(fyStart);

  function changeFy(newFyStart: number) {
    const idx = months.findIndex((m) => m.value === monthYear);
    const newMonths = fyMonthOptions(newFyStart);
    onChange(newMonths[idx === -1 ? 0 : idx].value);
  }

  return (
    <div style={{ display: "flex", gap: "1.75rem" }}>
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
      <label className="fy-field">
        <div className="fy-field-label">Month</div>
        <select value={monthYear} onChange={(e) => onChange(e.target.value)}>
          {months.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
