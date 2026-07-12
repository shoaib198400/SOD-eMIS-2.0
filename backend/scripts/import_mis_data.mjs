// One-time migration: import historical MIS field data from the full Google Sheets export
// (.xlsx, all tabs) into Postgres — monthly_submissions + field_values + approved_snapshots.
//
// Source of truth is MIS_DRAFT (one row per location+month, field values as a JSON blob keyed
// by f1/f2/f3... directly) rather than MIS_Submitted (label-column layout) — MIS_Submitted was
// found to have real column/value misalignment for at least some rows (a bug in the original
// sheet-writing code), so it's not safe to parse positionally. MIS_DRAFT holds the live working
// copy regardless of status and isn't reset on approval, so it also has the final values for
// already-SUBMITTED months — used here to build the approved_snapshots row too.
//
// Requires LocationMaster to already be imported — rows for unknown locations are skipped.
//
// Usage: node scripts/import_mis_data.mjs path/to/SOD_MIS.xlsx [--dry-run]

import "dotenv/config";
import ExcelJS from "exceljs";
import { Pool } from "pg";
import { parseSheetMonthYear, cellToString } from "./_importCommon.mjs";

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const xlsxPath = process.argv[2];
const dryRun = process.argv.includes("--dry-run");
if (!xlsxPath) {
  console.error("Usage: node scripts/import_mis_data.mjs path/to/SOD_MIS.xlsx [--dry-run]");
  process.exit(1);
}

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

const VALID_STATUSES = new Set(["NOT_STARTED", "IN_PROGRESS", "PENDING_REVIEW", "SUBMITTED", "REJECTED"]);

let created = 0;
let updated = 0;
let skipped = 0;
let snapshotsWritten = 0;
const skipReasons = [];

try {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(xlsxPath);

  const draftSheet = wb.getWorksheet("MIS_DRAFT");
  const statusSheet = wb.getWorksheet("SubmissionStatus");
  if (!draftSheet || !statusSheet) {
    console.error("Could not find MIS_DRAFT and/or SubmissionStatus sheets in the workbook.");
    process.exit(1);
  }

  const statusMap = new Map();
  for (const r of sheetRows(statusSheet)) {
    const monthDate = parseSheetMonthYear(r.month_year);
    const locationCode = cellToString(r.user_id);
    if (!monthDate || !locationCode) continue;
    statusMap.set(`${locationCode}|${monthDate}`, r);
  }

  const locationCodes = new Set((await pool.query("select code from locations")).rows.map((l) => l.code));

  for (const r of sheetRows(draftSheet)) {
    const locationCode = cellToString(r.USER_ID);
    const monthDate = parseSheetMonthYear(r.month_year);
    if (!locationCode || !monthDate) {
      skipped++;
      skipReasons.push(`(blank/unparseable row near "${locationCode || "?"}")`);
      continue;
    }
    if (!locationCodes.has(locationCode)) {
      skipped++;
      skipReasons.push(`${locationCode} ${monthDate}: location doesn't exist (import LocationMaster first)`);
      continue;
    }

    let fieldValues;
    try {
      fieldValues = JSON.parse(cellToString(r.data_json) || "{}");
    } catch {
      skipped++;
      skipReasons.push(`${locationCode} ${monthDate}: invalid data_json, skipped`);
      continue;
    }

    const statusRow = statusMap.get(`${locationCode}|${monthDate}`);
    const rawStatus = statusRow ? cellToString(statusRow.status) : "";
    // The original had a legacy LOCKED status treated as equivalent to SUBMITTED.
    const status = rawStatus === "LOCKED" ? "SUBMITTED" : VALID_STATUSES.has(rawStatus) ? rawStatus : "IN_PROGRESS";
    const completionPct = statusRow ? Number(cellToString(statusRow.completion_pct)) || 0 : 0;
    const checkerNotes = statusRow ? cellToString(statusRow.checker_notes) || null : null;
    const submittedAt = statusRow ? cellToString(statusRow.submitted_at) || null : null;
    const lockedAt = statusRow ? cellToString(statusRow.locked_at) || null : null;
    const lastUpdated = cellToString(r.last_updated) || new Date().toISOString();

    const fieldEntries = Object.entries(fieldValues).filter(([k]) => /^f\d+$/.test(k));

    if (dryRun) {
      created++;
      if (status === "SUBMITTED") snapshotsWritten++;
      continue;
    }

    const subResult = await pool.query(
      `insert into monthly_submissions (location_code, month_year, status, completion_pct, submitted_at, checker_notes, last_updated_at)
       values ($1,$2,$3,$4,$5,$6,$7)
       on conflict (location_code, month_year) do update set
         status = excluded.status, completion_pct = excluded.completion_pct,
         submitted_at = excluded.submitted_at, checker_notes = excluded.checker_notes,
         last_updated_at = excluded.last_updated_at
       returning id, (xmax = 0) as inserted`,
      [locationCode, monthDate, status, completionPct, submittedAt, checkerNotes, lastUpdated]
    );
    const submissionId = subResult.rows[0].id;
    if (subResult.rows[0].inserted) created++;
    else updated++;

    await pool.query("delete from field_values where submission_id = $1", [submissionId]);
    if (fieldEntries.length > 0) {
      const valueRows = fieldEntries.map(([, v]) => (v === null || v === undefined ? "" : String(v)));
      const placeholders = fieldEntries
        .map((_, i) => `($1, $${i * 2 + 2}, $${i * 2 + 3})`)
        .join(", ");
      const params = [submissionId];
      fieldEntries.forEach(([k], i) => {
        params.push(k, valueRows[i]);
      });
      await pool.query(`insert into field_values (submission_id, field_key, value) values ${placeholders}`, params);
    }

    if (status === "SUBMITTED") {
      const snapshot = Object.fromEntries(fieldEntries.map(([k, v]) => [k, v === null || v === undefined ? "" : String(v)]));
      await pool.query(
        `insert into approved_snapshots (submission_id, location_code, month_year, snapshot, approved_at)
         values ($1,$2,$3,$4,$5)
         on conflict (submission_id) do update set snapshot = excluded.snapshot, approved_at = excluded.approved_at`,
        [submissionId, locationCode, monthDate, JSON.stringify(snapshot), lockedAt || lastUpdated]
      );
      snapshotsWritten++;
    }
  }

  console.log(
    `${dryRun ? "[DRY RUN] " : ""}Import complete: ${created} created, ${updated} updated, ${skipped} skipped, ${snapshotsWritten} approved snapshots written.`
  );
  if (skipReasons.length) {
    console.log("\nSkipped rows:");
    for (const reason of skipReasons.slice(0, 50)) console.log(`  - ${reason}`);
    if (skipReasons.length > 50) console.log(`  ... and ${skipReasons.length - 50} more`);
  }
} finally {
  await pool.end();
}
