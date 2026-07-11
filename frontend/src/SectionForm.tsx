import { useEffect, useState } from "react";
import { api } from "./api";
import type { FieldDef, SubmissionResponse } from "./api";

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
  monthYear,
  sectionNo,
}: {
  locationCode: string;
  monthYear: string;
  sectionNo: number;
}) {
  const [fields, setFields] = useState<FieldDef[] | null>(null);
  const [sectionName, setSectionName] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [submission, setSubmission] = useState<SubmissionResponse | null>(null);
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
        setSubmission(sub);
        setValues(sub.values);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [locationCode, monthYear, sectionNo]);

  const isLocked = submission?.status === "SUBMITTED" || submission?.status === "PENDING_REVIEW";

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
      setSubmission(result);
      setSectionComplete(result.sectionComplete);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p>Loading section...</p>;
  if (error) return <p style={{ color: "crimson" }}>{error}</p>;
  if (!fields) return null;

  return (
    <div>
      <h2 style={{ marginBottom: 0 }}>{sectionName}</h2>
      <p style={{ color: "#555", marginTop: "0.25rem" }}>
        Status: <strong>{submission?.status}</strong> · Completion: {submission?.completionPct}%
        {sectionComplete && " · Section 1 complete"}
      </p>
      {isLocked && <p style={{ color: "#b45309" }}>This month is locked and cannot be edited.</p>}

      {groupBySub(fields).map((group) => (
        <fieldset key={group.sub} style={{ marginBottom: "1rem", border: "1px solid #ddd", borderRadius: 6 }}>
          <legend style={{ padding: "0 0.5rem", fontWeight: 600 }}>{group.sub}</legend>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", padding: "0.5rem" }}>
            {group.fields
              .filter((field) => isFieldVisible(field, values))
              .map((field) => (
                <FieldInput
                  key={field.key}
                  field={field}
                  value={values[field.key] ?? ""}
                  disabled={isLocked}
                  onChange={(v) => setValues((prev) => ({ ...prev, [field.key]: v }))}
                />
              ))}
          </div>
        </fieldset>
      ))}

      {!isLocked && (
        <button onClick={handleSave} disabled={saving} style={{ padding: "0.6rem 1.2rem" }}>
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
  return (
    <label style={{ gridColumn: isTextarea ? "1 / -1" : undefined, fontSize: "0.9rem" }}>
      <div>
        {field.label}
        {field.req && !field.auto && <span style={{ color: "crimson" }}> *</span>}
      </div>
      {field.auto ? (
        <div style={{ padding: "0.4rem", background: "#f3f4f6", borderRadius: 4 }}>{value || "—"}</div>
      ) : field.type === "select" ? (
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
          maxLength={750}
          onChange={(e) => onChange(e.target.value)}
          style={{ width: "100%", padding: "0.4rem", minHeight: 60 }}
        />
      ) : field.type === "date" ? (
        <input
          type="date"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          style={{ width: "100%", padding: "0.4rem" }}
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
          style={{ width: "100%", padding: "0.4rem" }}
        />
      )}
      {field.hint && <div style={{ fontSize: "0.75rem", color: "#777" }}>{field.hint}</div>}
    </label>
  );
}
