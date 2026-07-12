// Mirrors backend/src/formDefs.ts SECTION_NAMES — small enough to duplicate rather than
// add a round-trip API call just for section titles.
export const SECTION_NAMES: Record<number, string> = {
  1: "S1 — Operations",
  2: "S2 — Facilities & Planning (F&P)",
  3: "S3 — Supply & Distribution (S&D)",
  4: "S4 — Biofuel",
  5: "S5 — Maintenance & Inspection (M&I)",
  6: "S6 — Health, Safety & Environment (HSE)",
  7: "S7 — Operational Efficiency & TAS",
  8: "S8 — EM Lock Performance",
  9: "S9 — Transportation",
  10: "S10 — Others",
};

// Short form for the sidebar nav (matches the reference app's sidebar labels).
export const SECTION_NAMES_SHORT: Record<number, string> = {
  1: "S1 - Operations",
  2: "S2 - Facilities & Planning",
  3: "S3 - S&D",
  4: "S4 - Biofuel",
  5: "S5 - M&I",
  6: "S6 - HSE",
  7: "S7 - Operational Efficiency",
  8: "S8 - EM Lock",
  9: "S9 - Transportation",
  10: "S10 - Others",
};
