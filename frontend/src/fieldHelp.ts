// Ported from the reference app's _field_help() (app.py) — builds the same hover-tooltip
// text (rule summary + hint), used as a native `title` attribute so hovering the field
// itself shows guidance, matching the original's behavior exactly.
interface HelpableField {
  req: boolean;
  type: string;
  min?: number | null;
  max?: number | null;
  dec?: number | null;
  opts?: string[] | null;
  auto?: string | null;
  hint?: string;
  maxChars?: number;
}

export function buildFieldHelp(field: HelpableField): string {
  if (field.auto) return `Auto-calculated  ·  ${field.hint ?? ""}`;

  const parts: string[] = [field.req ? "required" : "optional"];

  if (field.type === "int") {
    parts.push("integer");
    if (field.min != null && field.min > 0) parts.push(`min=${field.min} (positive)`);
    else if (field.min != null) parts.push(`min=${field.min}`);
    if (field.max != null) parts.push(`max=${field.max}`);
  } else if (field.type === "number" || field.type === "float") {
    const dec = field.dec ?? 2;
    parts.push("number");
    if (field.min != null && field.min > 0) parts.push("only positive numbers");
    else if (field.min != null) parts.push(`min=${field.min}`);
    if (field.max != null) parts.push(`max=${field.max}`);
    parts.push(`upto ${dec} decimals`);
  } else if (field.type === "select") {
    parts.push(`select: ${(field.opts ?? []).join(" / ")}`);
  } else if (field.type === "textarea") {
    parts.push(`text; max ${field.maxChars ?? 750} characters`);
  } else if (field.type === "date") {
    parts.push("date; DD/MM/YYYY");
  } else if (field.type === "text") {
    parts.push("text");
  }

  const ruleStr = parts.join("; ");
  const hint = field.hint ?? "";
  return hint ? `${ruleStr}  ·  ${hint}` : ruleStr;
}
