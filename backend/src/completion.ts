import { FieldDef, SECTION_FIELDS, getExcludedFields } from "./formDefs";

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
  return true;
}
