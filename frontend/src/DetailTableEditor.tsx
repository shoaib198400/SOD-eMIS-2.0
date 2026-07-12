import { useEffect, useState } from "react";
import { api } from "./api";
import type { DetailRow } from "./api";

interface ColumnDef {
  key: string;
  label: string;
  type: "text" | "number" | "date" | "select";
  opts?: string[];
}

const TABLE_CONFIGS: Record<string, { title: string; columns: ColumnDef[] }> = {
  RAILWAY_CLAIM: {
    title: "Railway Claims",
    columns: [
      { key: "claim_no", label: "Claim No.", type: "text" },
      { key: "year", label: "Year", type: "text" },
      { key: "amount", label: "Amount (Rs)", type: "number" },
      { key: "status", label: "Status", type: "select", opts: ["Open", "Pending", "Closed"] },
      { key: "remarks", label: "Remarks", type: "text" },
    ],
  },
  IRR_DETAIL: {
    title: "IRR Details",
    columns: [
      { key: "irr_no", label: "IRR No.", type: "text" },
      { key: "irr_date", label: "IRR Date", type: "date" },
      { key: "description", label: "Description", type: "text" },
      { key: "amount", label: "Amount (Rs)", type: "number" },
      { key: "status", label: "Status", type: "select", opts: ["OPEN", "CLOSED"] },
      { key: "closure_date", label: "Closure Date", type: "date" },
    ],
  },
  LEGAL_CASE: {
    title: "Legal Cases",
    columns: [
      { key: "court_name", label: "Court Name", type: "text" },
      { key: "case_number", label: "Case Number", type: "text" },
      { key: "cause_title", label: "Cause Title", type: "text" },
      { key: "advocate", label: "Advocate", type: "text" },
      { key: "nature", label: "Nature", type: "text" },
      { key: "status", label: "Status", type: "select", opts: ["Open", "Closed"] },
      { key: "last_hearing", label: "Last Hearing", type: "date" },
      { key: "next_hearing", label: "Next Hearing", type: "date" },
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
      <h3 style={{ marginBottom: "0.5rem" }}>{config.title}</h3>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              {config.columns.map((col) => (
                <th key={col.key} style={{ border: "1px solid #ddd", padding: "0.4rem", fontSize: "0.85rem" }}>
                  {col.label}
                </th>
              ))}
              {!disabled && <th style={{ border: "1px solid #ddd" }} />}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={row.id ?? rowIndex}>
                {config.columns.map((col) => (
                  <td key={col.key} style={{ border: "1px solid #ddd", padding: "0.2rem" }}>
                    {col.type === "select" ? (
                      <select
                        value={(row[col.key] as string) ?? ""}
                        disabled={disabled}
                        onChange={(e) => updateCell(rowIndex, col.key, e.target.value)}
                        style={{ width: "100%", padding: "0.3rem" }}
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
                        style={{ width: "100%", padding: "0.3rem", border: "none" }}
                      />
                    )}
                  </td>
                ))}
                {!disabled && (
                  <td style={{ border: "1px solid #ddd", textAlign: "center" }}>
                    <button onClick={() => removeRow(rowIndex)}>Remove</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!disabled && (
        <div style={{ marginTop: "0.5rem", display: "flex", gap: "0.5rem" }}>
          <button onClick={addRow}>+ Add Row</button>
          <button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Table"}
          </button>
        </div>
      )}
    </div>
  );
}
