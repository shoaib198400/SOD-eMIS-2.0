// One-time migration: import Railway Claims / IRR Details / Legal Cases from the full Google
// Sheets export into detail_rows. Run AFTER import_mis_data.mjs (same stub-submission
// fallback as import_mi_data.mjs if a month has detail rows but no MIS_DRAFT entry).
//
// Column keys ported from frontend/src/DetailTableEditor.tsx's TABLE_CONFIGS — date fields
// here are free text in the original app (not real dates), so no date reformatting is applied,
// matching how the editor already treats them.
//
// Usage: node scripts/import_detail_tables.mjs path/to/SOD_MIS.xlsx [--dry-run]

import "dotenv/config";
import ExcelJS from "exceljs";
import { Pool } from "pg";
import { parseSheetMonthYear, cellToString } from "./_importCommon.mjs";

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const xlsxPath = process.argv[2];
const dryRun = process.argv.includes("--dry-run");
if (!xlsxPath) {
  console.error("Usage: node scripts/import_detail_tables.mjs path/to/SOD_MIS.xlsx [--dry-run]");
  process.exit(1);
}

const TABLES = {
  Railway_Claims: {
    tableType: "RAILWAY_CLAIM",
    columns: [
      ["Claim No.", "claim_no"],
      ["Year", "year"],
      ["Amount (Rs)", "amount"],
      ["RR Nos.", "rr_nos"],
      ["Ex", "ex_station"],
      ["To", "to_station"],
      ["T/Wagon Nos.", "wagon_nos"],
      ["Product", "product"],
      ["Qty.", "qty"],
      ["Rly.", "rly"],
      ["Pending Stage", "pending_stage"],
      ["Status of Claim", "status_claim"],
      ["Last Hearing Date", "last_hearing"],
      ["Next Hearing Date", "next_hearing"],
      ["RCT Case Status as per Website", "rct_status"],
      ["Case Facts", "case_facts"],
      ["Rejection Reasons", "rejection_reasons"],
      ["ShortComings/Discrepancies", "shortcomings"],
      ["Strength of Case", "strength"],
      ["Recommendation", "recommendation"],
    ],
  },
  IRR_Details: {
    tableType: "IRR_DETAIL",
    columns: [
      ["IRR#", "irr_no"],
      ["IRR Date", "irr_date"],
      ["IRR Description", "description"],
      ["IRR Amount (Rs)", "amount"],
      ["IRR Status (OPEN/CLOSED)", "status"],
      ["IRR Closure Date", "closure_date"],
    ],
  },
  Legal_Cases: {
    tableType: "LEGAL_CASE",
    columns: [
      ["Court Name", "court_name"],
      ["Case Number", "case_number"],
      ["Cause Title", "cause_title"],
      ["Advocate", "advocate"],
      ["Nature of Case", "nature"],
      ["Dealership Name and Location", "dealership"],
      ["Background", "background"],
      ["Status", "status"],
      ["Last Hearing Date", "last_hearing"],
      ["Next Hearing Date", "next_hearing"],
    ],
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

function isEmptyish(v) {
  const s = (v ?? "").trim().toUpperCase();
  return s === "" || s === "NA" || s === "N/A" || s === "NIL";
}

let created = 0;
let skipped = 0;
let stubSubmissionsCreated = 0;
const skipReasons = [];

try {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(xlsxPath);

  const locationCodes = new Set((await pool.query("select code from locations")).rows.map((l) => l.code));
  const submissionCache = new Map();

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

  for (const [sheetName, def] of Object.entries(TABLES)) {
    const sheet = wb.getWorksheet(sheetName);
    if (!sheet) {
      console.log(`Sheet "${sheetName}" not found in workbook, skipping.`);
      continue;
    }

    let sortOrder = 0;
    for (const r of sheetRows(sheet)) {
      const locationCode = cellToString(r.user_id);
      const monthDate = parseSheetMonthYear(r["Month-Year"]);
      if (!locationCode || !monthDate) {
        skipped++;
        skipReasons.push(`${sheetName}: blank/unparseable row near "${locationCode || "?"}"`);
        continue;
      }
      if (!locationCodes.has(locationCode)) {
        skipped++;
        skipReasons.push(`${sheetName} ${locationCode} ${monthDate}: unknown location`);
        continue;
      }

      const rowData = {};
      let hasRealData = false;
      for (const [sheetCol, key] of def.columns) {
        const val = cellToString(r[sheetCol]);
        rowData[key] = val;
        if (!isEmptyish(val)) hasRealData = true;
      }
      if (!hasRealData) continue; // placeholder "nothing to report this month" row

      if (dryRun) {
        created++;
        continue;
      }
      const submissionId = await getOrCreateSubmissionId(locationCode, monthDate);
      await pool.query(
        `insert into detail_rows (submission_id, table_type, row_data, sort_order) values ($1, $2, $3, $4)`,
        [submissionId, def.tableType, JSON.stringify(rowData), sortOrder++]
      );
      created++;
    }
  }

  console.log(
    `${dryRun ? "[DRY RUN] " : ""}Import complete: ${created} detail rows created, ${stubSubmissionsCreated} stub submissions created, ${skipped} skipped.`
  );
  if (skipReasons.length) {
    console.log("\nSkipped rows:");
    for (const reason of skipReasons.slice(0, 50)) console.log(`  - ${reason}`);
    if (skipReasons.length > 50) console.log(`  ... and ${skipReasons.length - 50} more`);
  }
} finally {
  await pool.end();
}
