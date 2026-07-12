import { useEffect, useState } from "react";
import { api } from "./api";
import type { DetailRow } from "./api";

interface ColumnDef {
  key: string;
  label: string;
  type: "text" | "number" | "date" | "select";
  opts?: string[];
}

// Ported verbatim from the reference app's _DETAIL_UI config (app.py). Date fields are kept
// as free text (not <input type="date">) because that's what the original allows — hearing
// dates etc. are sometimes entered as "TBD" or partial dates, not just ISO dates.
const TABLE_CONFIGS: Record<string, { title: string; columns: ColumnDef[] }> = {
  RAILWAY_CLAIM: {
    title: "Railway Claims Details",
    columns: [
      { key: "claim_no", label: "Claim No.", type: "text" },
      { key: "year", label: "Year", type: "number" },
      { key: "amount", label: "Amount (Rs)", type: "number" },
      { key: "rr_nos", label: "RR Nos.", type: "text" },
      { key: "ex_station", label: "Ex", type: "text" },
      { key: "to_station", label: "To", type: "text" },
      { key: "wagon_nos", label: "T/Wagon Nos.", type: "text" },
      { key: "product", label: "Product", type: "text" },
      { key: "qty", label: "Qty.", type: "number" },
      { key: "rly", label: "Rly.", type: "text" },
      { key: "pending_stage", label: "Pending Stage", type: "text" },
      { key: "status_claim", label: "Status of Claim", type: "text" },
      { key: "last_hearing", label: "Last Hearing Date", type: "text" },
      { key: "next_hearing", label: "Next Hearing Date", type: "text" },
      { key: "rct_status", label: "RCT Status", type: "text" },
      { key: "case_facts", label: "Case Facts", type: "text" },
      { key: "rejection_reasons", label: "Rejection Reasons", type: "text" },
      { key: "shortcomings", label: "ShortComings", type: "text" },
      { key: "strength", label: "Strength of Case", type: "text" },
      { key: "recommendation", label: "Recommendation", type: "text" },
    ],
  },
  IRR_DETAIL: {
    title: "IRR Details",
    columns: [
      { key: "irr_no", label: "IRR #", type: "text" },
      { key: "irr_date", label: "IRR Date", type: "text" },
      { key: "description", label: "Description", type: "text" },
      { key: "amount", label: "Amount (Rs)", type: "number" },
      { key: "status", label: "Status", type: "select", opts: ["OPEN", "CLOSED"] },
      { key: "closure_date", label: "Closure Date", type: "text" },
    ],
  },
  LEGAL_CASE: {
    title: "Legal Cases Details",
    columns: [
      { key: "court_name", label: "Court Name", type: "text" },
      { key: "case_number", label: "Case Number", type: "text" },
      { key: "cause_title", label: "Cause Title", type: "text" },
      { key: "advocate", label: "Advocate", type: "text" },
      { key: "nature", label: "Nature of Case", type: "text" },
      { key: "dealership", label: "Dealership / Location", type: "text" },
      { key: "background", label: "Background", type: "text" },
      { key: "status", label: "Status", type: "text" },
      { key: "last_hearing", label: "Last Hearing Date", type: "text" },
      { key: "next_hearing", label: "Next Hearing Date", type: "text" },
    ],
  },
};

export function DetailTableEditor({
  locationCode,
  monthYear,
  tableType,
  disabled,
}: {
  locationCode: string;
  monthYear: string;
  tableType: keyof typeof TABLE_CONFIGS;
  disabled: boolean;
}) {
  const config = TABLE_CONFIGS[tableType];
  const [rows, setRows] = useState<DetailRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    api
      .getDetailTable(locationCode, monthYear, tableType)
      .then((res) => setRows(res.rows))
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [locationCode, monthYear, tableType]);

  function updateCell(rowIndex: number, key: string, value: string) {
    setRows((prev) => prev.map((row, i) => (i === rowIndex ? { ...row, [key]: value } : row)));
  }

  function addRow() {
    setRows((prev) => [...prev, {}]);
  }

  function removeRow(rowIndex: number) {
    setRows((prev) => prev.filter((_, i) => i !== rowIndex));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const result = await api.saveDetailTable(locationCode, monthYear, tableType, rows);
      setRows(result.rows);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p>Loading {config.title}...</p>;

  return (
    <div style={{ marginTop: "1rem" }}>
      <h3 style={{ marginBottom: "0.5rem", color: "var(--navy-deep)" }}>{config.title}</h3>
      {error && <p style={{ color: "var(--red)" }}>{error}</p>}
      <div style={{ overflowX: "auto" }}>
        <table className="themed-table">
          <thead>
            <tr>
              {config.columns.map((col) => (
                <th key={col.key}>{col.label}</th>
              ))}
              {!disabled && <th />}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={row.id ?? rowIndex}>
                {config.columns.map((col) => (
                  <td key={col.key}>
                    {col.type === "select" ? (
                      <select
                        value={(row[col.key] as string) ?? ""}
                        disabled={disabled}
                        onChange={(e) => updateCell(rowIndex, col.key, e.target.value)}
                        style={{ width: "100%" }}
                      >
                        <option value="">Select...</option>
                        {col.opts?.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={col.type === "number" ? "number" : col.type === "date" ? "date" : "text"}
                        value={(row[col.key] as string) ?? ""}
                        disabled={disabled}
                        onChange={(e) => updateCell(rowIndex, col.key, e.target.value)}
                        style={{ width: "100%" }}
                      />
                    )}
                  </td>
                ))}
                {!disabled && (
                  <td style={{ textAlign: "center" }}>
                    <button onClick={() => removeRow(rowIndex)} className="btn btn-secondary" style={{ padding: "0.25rem 0.6rem", fontSize: "0.8rem" }}>
                      Remove
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!disabled && (
        <div style={{ marginTop: "0.5rem", display: "flex", gap: "0.5rem" }}>
          <button onClick={addRow} className="btn btn-secondary">
            + Add Row
          </button>
          <button onClick={handleSave} disabled={saving} className="btn btn-save">
            {saving ? "Saving..." : "Save Table"}
          </button>
        </div>
      )}
    </div>
  );
}
