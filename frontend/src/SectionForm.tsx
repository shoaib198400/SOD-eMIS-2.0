import { useEffect, useState } from "react";
import { api } from "./api";
import type { FieldDef } from "./api";
import { buildFieldHelp } from "./fieldHelp";
import { computeDeadline } from "./deadline";

function isFieldVisible(field: FieldDef, values: Record<string, string>): boolean {
  if (!field.showWhen) return true;
  return Object.entries(field.showWhen).every(([key, expected]) => values[key] === expected);
}

function groupBySub(fields: FieldDef[]): { sub: string; fields: FieldDef[] }[] {
  const groups: { sub: string; fields: FieldDef[] }[] = [];
  for (const field of fields) {
    const last = groups[groups.length - 1];
    if (last && last.sub === field.sub) {
      last.fields.push(field);
    } else {
      groups.push({ sub: field.sub, fields: [field] });
    }
  }
  return groups;
}

export function SectionForm({
  locationCode,
  locationName,
  monthYear,
  sectionNo,
  disabled,
  onSaved,
}: {
  locationCode: string;
  locationName?: string | null;
  monthYear: string;
  sectionNo: number;
  disabled: boolean;
  onSaved?: () => void;
}) {
  const [fields, setFields] = useState<FieldDef[] | null>(null);
  const [sectionName, setSectionName] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sectionComplete, setSectionComplete] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([api.fieldDefs(sectionNo), api.getSubmission(locationCode, monthYear)])
      .then(([defs, sub]) => {
        setFields(defs.fields);
        setSectionName(defs.sectionName);
        setValues(sub.values);
        setSectionComplete(Boolean(sub.sectionsComplete?.[sectionNo]));
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [locationCode, monthYear, sectionNo]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const editableValues: Record<string, string> = {};
      for (const field of fields ?? []) {
        if (!field.auto) editableValues[field.key] = values[field.key] ?? "";
      }
      const result = await api.saveSection(locationCode, monthYear, sectionNo, editableValues);
      setValues(result.values);
      setSectionComplete(result.sectionComplete);
      onSaved?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p>Loading section...</p>;
  if (error) return <p style={{ color: "crimson" }}>{error}</p>;
  if (!fields) return null;

  const monthLabel = computeDeadline(monthYear).monthLabel;

  return (
    <div>
      <div className="dash-card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <div>
          <div style={{ fontWeight: 700, color: "var(--navy-deep)" }}>📋 {sectionName}</div>
          <div style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
            Period: <strong>{monthLabel}</strong> &nbsp;&middot;&nbsp; Location: <strong>{locationName ?? locationCode}</strong>
            {disabled && (
              <>
                {" "}
                &nbsp;&middot;&nbsp; 🔒 <em>Read-only (locked)</em>
              </>
            )}
          </div>
        </div>
        {disabled ? (
          <span className="status-pill submitted">✓ Locked</span>
        ) : (
          <span className={`status-pill ${sectionComplete ? "submitted" : "not-started"}`}>
            {sectionComplete ? "Section complete" : "Section incomplete"}
          </span>
        )}
      </div>

      {groupBySub(fields).map((group) => (
        <div key={group.sub} className="sec-card" style={{ padding: 0, overflow: "hidden" }}>
          <div
            style={{
              background: "linear-gradient(135deg, var(--navy-deepest) 0%, var(--navy) 100%)",
              color: "white",
              padding: "0.5rem 0.9rem",
              fontWeight: 700,
            }}
          >
            📌 {group.sub}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", padding: "0.85rem" }}>
            {group.fields
              .filter((field) => isFieldVisible(field, values))
              .map((field) => (
                <FieldInput
                  key={field.key}
                  field={field}
                  value={values[field.key] ?? ""}
                  disabled={disabled}
                  onChange={(v) => setValues((prev) => ({ ...prev, [field.key]: v }))}
                />
              ))}
          </div>
        </div>
      ))}

      {!disabled && (
        <button onClick={handleSave} disabled={saving} className="btn btn-save">
          {saving ? "Saving..." : "Save Section"}
        </button>
      )}
    </div>
  );
}

function FieldInput({
  field,
  value,
  disabled,
  onChange,
}: {
  field: FieldDef;
  value: string;
  disabled: boolean;
  onChange: (v: string) => void;
}) {
  const isTextarea = field.type === "textarea";
  const tooltip = buildFieldHelp({ req: field.req, type: field.type, min: field.min, max: field.max, dec: field.dec, opts: field.opts, auto: field.auto, hint: field.hint });
  return (
    <label style={{ gridColumn: isTextarea ? "1 / -1" : undefined, fontSize: "0.9rem" }}>
      <div style={{ color: "var(--navy-deep)", marginBottom: "0.2rem" }}>
        {field.label}
        {field.req && !field.auto && <span style={{ color: "var(--red)" }}> *</span>}
      </div>
      {field.auto ? (
        <div className="auto-box" title={tooltip}>{value || "—"}</div>
      ) : field.type === "select" ? (
        <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} style={{ width: "100%" }} title={tooltip}>
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
          maxLength={750}
          onChange={(e) => onChange(e.target.value)}
          style={{ width: "100%", minHeight: 60 }}
          title={tooltip}
        />
      ) : field.type === "date" ? (
        <input
          type="date"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          style={{ width: "100%" }}
          title={tooltip}
        />
      ) : (
        <input
          type="number"
          value={value}
          disabled={disabled}
          min={field.min ?? undefined}
          max={field.max ?? undefined}
          step={field.dec ? 1 / 10 ** field.dec : field.type === "int" ? 1 : "any"}
          onChange={(e) => onChange(e.target.value)}
          style={{ width: "100%" }}
          title={tooltip}
        />
      )}
    </label>
  );
}
