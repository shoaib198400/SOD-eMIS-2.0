// Shared helpers for the historical-data import scripts (import_mis_data.mjs,
// import_mi_data.mjs, import_detail_tables.mjs, import_tank_master.mjs).

const MONTH_ABBR = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

// Sheet month_year cells look like "Apr-2026" (sometimes ExcelJS hands back a Date object
// if Excel auto-detected the cell as a date) -> Postgres "YYYY-MM-01".
export function parseSheetMonthYear(raw) {
  if (raw instanceof Date) {
    return `${raw.getUTCFullYear()}-${String(raw.getUTCMonth() + 1).padStart(2, "0")}-01`;
  }
  const s = String(raw ?? "").trim();
  const m = s.match(/^([A-Za-z]{3})-(\d{4})$/);
  if (!m) return null;
  const month = MONTH_ABBR[m[1].toLowerCase()];
  if (!month) return null;
  return `${m[2]}-${month}-01`;
}

// Sheet date cells are "DD/MM/YYYY", "NA", blank, or occasionally a Date object -> our
// <input type="date"> expects "YYYY-MM-DD" (or "" for not-applicable/unset).
export function parseSheetDate(raw) {
  if (raw instanceof Date) {
    return `${raw.getUTCFullYear()}-${String(raw.getUTCMonth() + 1).padStart(2, "0")}-${String(raw.getUTCDate()).padStart(2, "0")}`;
  }
  const s = String(raw ?? "").trim();
  if (!s || s.toUpperCase() === "NA" || s.toUpperCase() === "N/A") return "";
  const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (!m) return ""; // unparseable free text (rare) -> leave blank rather than guess wrong
  const [, d, mo, y] = m;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

// Generic cell-to-string for non-date field values (numbers/text mixed in the same column).
export function cellToString(raw) {
  if (raw === null || raw === undefined) return "";
  if (raw instanceof Date) return parseSheetDate(raw);
  if (typeof raw === "object" && "text" in raw) return String(raw.text); // rich text cells
  return String(raw).trim();
}
