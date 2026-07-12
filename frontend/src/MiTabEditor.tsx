import { useEffect, useState } from "react";
import { api } from "./api";
import type { MiFieldDef } from "./api";

function isFieldVisible(field: MiFieldDef, values: Record<string, string>): boolean {
  if (!field.showWhen) return true;
  return Object.entries(field.showWhen).every(([key, expected]) => values[key] === expected);
}

function MiFieldInput({
  field,
  value,
  disabled,
  onChange,
}: {
  field: MiFieldDef;
  value: string;
  disabled: boolean;
  onChange: (v: string) => void;
}) {
  const isWide = field.type === "textarea";
  return (
    <label style={{ gridColumn: isWide ? "1 / -1" : undefined, fontSize: "0.9rem" }}>
      <div style={{ color: "var(--navy-deep)", marginBottom: "0.2rem" }}>
        {field.label}
        {field.required && <span style={{ color: "var(--red)" }}> *</span>}
      </div>
      {field.type === "select" ? (
        <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} style={{ width: "100%", padding: "0.4rem" }}>
          <option value="">Select...</option>
          {field.opts?.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      ) : field.type === "textarea" ? (
        <textarea
          value={value}
          disabled={disabled}
          maxLength={field.maxChars}
          onChange={(e) => onChange(e.target.value)}
          style={{ width: "100%", padding: "0.4rem", minHeight: 60 }}
        />
      ) : field.type === "date" ? (
        <input type="date" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} style={{ width: "100%", padding: "0.4rem" }} />
      ) : field.type === "int" || field.type === "float" ? (
        <input
          type="number"
          step={field.type === "float" ? "any" : 1}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          style={{ width: "100%", padding: "0.4rem" }}
        />
      ) : (
        <input
          type="text"
          value={value}
          disabled={disabled}
          maxLength={field.maxChars}
          onChange={(e) => onChange(e.target.value)}
          style={{ width: "100%", padding: "0.4rem" }}
        />
      )}
    </label>
  );
}

function RowCard({
  fields,
  values,
  disabled,
  onChange,
  onRemove,
  title,
}: {
  fields: MiFieldDef[];
  values: Record<string, string>;
  disabled: boolean;
  onChange: (key: string, value: string) => void;
  onRemove?: () => void;
  title: string;
}) {
  return (
    <div className="sec-card">
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
        <strong style={{ color: "var(--navy)" }}>{title}</strong>
        {!disabled && onRemove && (
          <button onClick={onRemove} className="btn btn-secondary" style={{ padding: "0.25rem 0.6rem", fontSize: "0.8rem" }}>
            Remove
          </button>
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
        {fields
          .filter((f) => isFieldVisible(f, values))
          .map((f) => (
            <MiFieldInput key={f.key} field={f} value={values[f.key] ?? ""} disabled={disabled} onChange={(v) => onChange(f.key, v)} />
          ))}
      </div>
    </div>
  );
}

export function MiTabEditor({
  locationCode,
  monthYear,
  tabKey,
  disabled,
  onSaved,
}: {
  locationCode: string;
  monthYear: string;
  tabKey: string;
  disabled: boolean;
  onSaved?: () => void;
}) {
  const [tab, setTab] = useState<{ label: string; isMultiRow: boolean; naLabel: string; fields: MiFieldDef[] } | null>(null);
  const [isNA, setIsNA] = useState(false);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api
      .getMiTab(locationCode, monthYear, tabKey)
      .then((res) => {
        setTab({ label: res.label, isMultiRow: res.isMultiRow, naLabel: res.naLabel, fields: res.fields });
        setIsNA(res.isNotApplicable);
        setRows(res.rows.length > 0 ? res.rows : res.isMultiRow ? [] : [{}]);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [locationCode, monthYear, tabKey]);

  function updateRow(index: number, key: string, value: string) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, [key]: value } : r)));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await api.saveMiTab(locationCode, monthYear, tabKey, isNA, isNA ? [] : rows);
      onSaved?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p>Loading...</p>;
  if (!tab) return null;

  return (
    <div>
      <h3 style={{ color: "var(--navy-deep)" }}>{tab.label}</h3>
      {error && <p style={{ color: "var(--red)" }}>{error}</p>}

      <label style={{ display: "block", marginBottom: "0.75rem", padding: "0.5rem 0.75rem", background: "#fef3c7", borderRadius: 8 }}>
        <input type="checkbox" checked={isNA} disabled={disabled} onChange={(e) => setIsNA(e.target.checked)} /> {tab.naLabel}
      </label>

      {!isNA &&
        rows.map((row, i) => (
          <RowCard
            key={i}
            fields={tab.fields}
            values={row}
            disabled={disabled}
            onChange={(key, value) => updateRow(i, key, value)}
            onRemove={tab.isMultiRow ? () => setRows((prev) => prev.filter((_, idx) => idx !== i)) : undefined}
            title={tab.isMultiRow ? `Row ${i + 1}` : "Details"}
          />
        ))}

      {!disabled && !isNA && tab.isMultiRow && (
        <button onClick={() => setRows((prev) => [...prev, {}])} className="btn btn-secondary">
          + Add Row
        </button>
      )}

      {!disabled && (
        <div style={{ marginTop: "0.75rem" }}>
          <button onClick={handleSave} disabled={saving} className="btn btn-save">
            {saving ? "Saving..." : "Save Tab"}
          </button>
        </div>
      )}
    </div>
  );
}
