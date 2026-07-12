// One-time migration: import M&I (Section 5A) data from the 10 MI_* sheets in the full
// Google Sheets export into mi_rows / mi_singletons / mi_submodule_status.
//
// Run AFTER import_mis_data.mjs — MI rows attach to a monthly_submissions row looked up by
// (location_code, month_year); if the location has no MIS data at all for that month, a stub
// NOT_STARTED submission is created so the M&I data isn't dropped.
//
// Usage: node scripts/import_mi_data.mjs path/to/SOD_MIS.xlsx [--dry-run]

import "dotenv/config";
import ExcelJS from "exceljs";
import { Pool } from "pg";
import { parseSheetMonthYear, parseSheetDate, cellToString } from "./_importCommon.mjs";

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const xlsxPath = process.argv[2];
const dryRun = process.argv.includes("--dry-run");
if (!xlsxPath) {
  console.error("Usage: node scripts/import_mi_data.mjs path/to/SOD_MIS.xlsx [--dry-run]");
  process.exit(1);
}

const NON_FIELD_COLS = new Set(["user_id", "month_year", "row_no", "na_flag", "saved_at", "zone", "loc_name"]);

// Ported from miDefs.ts field type="date" entries — used to reformat DD/MM/YYYY -> YYYY-MM-DD
// for exactly these columns; everything else passes through as plain text/number.
const TAB_DEFS = {
  MI_TANK_OUTAGE: { isMultiRow: true, dateFields: ["planned_start", "planned_end", "actual_start", "actual_end"] },
  MI_MAJOR_REPAIR: { isMultiRow: true, dateFields: ["etc_date"] },
  MI_VRU: { isMultiRow: false, dateFields: ["date_not_operating", "etc_date"] },
  MI_AUDIT_2526: { isMultiRow: false, dateFields: ["audit_date"] },
  MI_AUDIT_2627: { isMultiRow: false, dateFields: ["audit_date"] },
  MI_TECH_AUDIT: { isMultiRow: true, dateFields: ["audit_date"] },
  MI_EQUIP_BREAKDOWN: { isMultiRow: true, dateFields: ["start_date", "proposed_date", "actual_end_date"] },
  MI_INT_PIPELINE: { isMultiRow: false, dateFields: ["last_ut_date", "last_hydrotest_date", "last_dcvg_date", "last_lrut_date"] },
  MI_EXT_PIPELINE: { isMultiRow: true, dateFields: ["last_ut_date", "last_hydrotest_date", "last_dcvg_date", "last_lrut_date"] },
  MI_TANK_STATUS: {
    isMultiRow: true,
    dateFields: ["cleaning_completed_date", "cleaning_due_date", "inspection_date", "inspection_due_date", "painting_date", "painting_due_date"],
  },
};

function sheetRows(sheet) {
  const header = sheet.getRow(1).values.map((h) => (h ? String(h).trim() : h));
  const rows = [];
  for (let i = 2; i <= sheet.rowCount; i++) {
    const values = sheet.getRow(i).values;
    const obj = {};
    for (let c = 1; c < header.length; c++) if (header[c]) obj[header[c]] = values[c];
    rows.push(obj);
  }
  return rows;
}

let rowsImported = 0;
let skipped = 0;
let stubSubmissionsCreated = 0;
const skipReasons = [];

try {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(xlsxPath);

  const locationCodes = new Set((await pool.query("select code from locations")).rows.map((l) => l.code));
  const submissionCache = new Map(); // "code|month" -> submission id

  async function getOrCreateSubmissionId(locationCode, monthDate) {
    const cacheKey = `${locationCode}|${monthDate}`;
    if (submissionCache.has(cacheKey)) return submissionCache.get(cacheKey);
    const existing = await pool.query("select id from monthly_submissions where location_code = $1 and month_year = $2", [
      locationCode,
      monthDate,
    ]);
    if (existing.rows[0]) {
      submissionCache.set(cacheKey, existing.rows[0].id);
      return existing.rows[0].id;
    }
    if (dryRun) {
      submissionCache.set(cacheKey, -1);
      return -1;
    }
    const inserted = await pool.query(
      `insert into monthly_submissions (location_code, month_year, status, completion_pct) values ($1, $2, 'NOT_STARTED', 0) returning id`,
      [locationCode, monthDate]
    );
    stubSubmissionsCreated++;
    submissionCache.set(cacheKey, inserted.rows[0].id);
    return inserted.rows[0].id;
  }

  for (const [tabKey, def] of Object.entries(TAB_DEFS)) {
    const sheet = wb.getWorksheet(tabKey);
    if (!sheet) {
      console.log(`Sheet "${tabKey}" not found in workbook, skipping this tab entirely.`);
      continue;
    }

    const rows = sheetRows(sheet);
    // For singleton tabs, keep only the LAST row per (location, month) — matches the
    // original's delete-then-reinsert save semantics (last write wins).
    const singletonLatest = new Map();

    for (const r of rows) {
      const locationCode = cellToString(r.user_id);
      const monthDate = parseSheetMonthYear(r.month_year);
      if (!locationCode || !monthDate) {
        skipped++;
        skipReasons.push(`${tabKey}: blank/unparseable row near "${locationCode || "?"}"`);
        continue;
      }
      if (!locationCodes.has(locationCode)) {
        skipped++;
        skipReasons.push(`${tabKey} ${locationCode} ${monthDate}: unknown location`);
        continue;
      }

      const isNA = cellToString(r.na_flag).toUpperCase() === "Y";
      const rowData = {};
      for (const [col, val] of Object.entries(r)) {
        if (NON_FIELD_COLS.has(col)) continue;
        rowData[col] = def.dateFields.includes(col) ? parseSheetDate(val) : cellToString(val);
      }

      if (!def.isMultiRow) {
        singletonLatest.set(`${locationCode}|${monthDate}`, { locationCode, monthDate, isNA, rowData });
        continue;
      }

      if (dryRun) {
        rowsImported++;
        continue;
      }
      const submissionId = await getOrCreateSubmissionId(locationCode, monthDate);
      await pool.query(
        `insert into mi_submodule_status (submission_id, tab_key, is_not_applicable) values ($1, $2, $3)
         on conflict (submission_id, tab_key) do update set is_not_applicable = excluded.is_not_applicable`,
        [submissionId, tabKey, isNA]
      );
      if (!isNA && Object.values(rowData).some((v) => v !== "")) {
        await pool.query(
          `insert into mi_rows (submission_id, tab_key, row_data, sort_order) values ($1, $2, $3, $4)`,
          [submissionId, tabKey, JSON.stringify(rowData), rowsImported]
        );
      }
      rowsImported++;
    }

    for (const { locationCode, monthDate, isNA, rowData } of singletonLatest.values()) {
      if (dryRun) {
        rowsImported++;
        continue;
      }
      const submissionId = await getOrCreateSubmissionId(locationCode, monthDate);
      await pool.query(
        `insert into mi_submodule_status (submission_id, tab_key, is_not_applicable) values ($1, $2, $3)
         on conflict (submission_id, tab_key) do update set is_not_applicable = excluded.is_not_applicable`,
        [submissionId, tabKey, isNA]
      );
      if (!isNA && Object.values(rowData).some((v) => v !== "")) {
        await pool.query(
          `insert into mi_singletons (submission_id, tab_key, data) values ($1, $2, $3)
           on conflict (submission_id, tab_key) do update set data = excluded.data`,
          [submissionId, tabKey, JSON.stringify(rowData)]
        );
      }
      rowsImported++;
    }
  }

  console.log(
    `${dryRun ? "[DRY RUN] " : ""}Import complete: ${rowsImported} M&I rows processed, ${stubSubmissionsCreated} stub submissions created, ${skipped} skipped.`
  );
  if (skipReasons.length) {
    console.log("\nSkipped rows:");
    for (const reason of skipReasons.slice(0, 50)) console.log(`  - ${reason}`);
    if (skipReasons.length > 50) console.log(`  ... and ${skipReasons.length - 50} more`);
  }
} finally {
  await pool.end();
}
