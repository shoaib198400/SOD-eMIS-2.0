import { FieldDef, SECTION_FIELDS, getExcludedFields, getSkipSections } from "./formDefs";

const TOTAL_SECTIONS = 10;

export function isFieldVisible(
  field: FieldDef,
  values: Record<string, string | undefined>,
  excludedKeys: Set<string>
): boolean {
  if (excludedKeys.has(field.key)) return false;
  if (field.showWhen) {
    for (const [depKey, requiredValue] of Object.entries(field.showWhen)) {
      if (values[depKey] !== requiredValue) return false;
    }
  }
  return true;
}

// A section counts complete when every required, non-auto, currently-visible field has a
// value. Re-derived from current field defs each time (matches the original app's behavior
// of live-revalidating completion against the current form_defs rather than a stored snapshot).
export function isSectionComplete(
  sectionNo: number,
  locType: string,
  values: Record<string, string | undefined>
): boolean {
  const fields = SECTION_FIELDS[sectionNo] || [];
  const excluded = getExcludedFields(locType);
  for (const field of fields) {
    if (field.auto) continue;
    if (!field.req) continue;
    if (!isFieldVisible(field, values, excluded)) continue;
    const v = values[field.key];
    if (v === undefined || v === null || v === "") return false;
  }

  // Original app's one hardcoded cross-field rule: Section 1's "Complied Recommendations"
  // (f161) cannot exceed "Total Recommendations" (f160) — blocks marking the section
  // complete, but doesn't block saving the draft itself.
  if (sectionNo === 1) {
    const total = parseFloat(values.f160 ?? "");
    const complied = parseFloat(values.f161 ?? "");
    if (!Number.isNaN(total) && !Number.isNaN(complied) && complied > total) return false;
  }

  return true;
}

// Overall progress across all 10 sections — sections skipped entirely for this location type
// (e.g. TOP/HMEL skip Facilities & Planning and M&I) count as auto-complete, matching the
// original app's "N/A sections are auto-completed, not shown to the user" behavior.
// completion_pct is simply (# complete sections) * 10, matching the original's formula exactly.
export function computeOverallCompletion(
  locType: string,
  values: Record<string, string | undefined>
): { completionPct: number; sectionsComplete: Record<number, boolean> } {
  const skip = getSkipSections(locType);
  const sectionsComplete: Record<number, boolean> = {};
  let completeCount = 0;

  for (let s = 1; s <= TOTAL_SECTIONS; s++) {
    const complete = skip.has(s) || isSectionComplete(s, locType, values);
    sectionsComplete[s] = complete;
    if (complete) completeCount++;
  }

  return { completionPct: completeCount * 10, sectionsComplete };
}
