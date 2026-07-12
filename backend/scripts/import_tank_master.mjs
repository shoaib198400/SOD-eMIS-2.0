// One-time migration: import Tank Master (location_code + tank_no pairs, which feed the tank
// dropdowns in Section 1 / M&I forms) from the full Google Sheets export's TankMaster tab.
// The sheet has far more columns (capacity, product, dates, etc.) than our tank_master table
// currently models — only Location Code + Tank No. are imported; the rest is a possible future
// enhancement, not part of this migration.
//
// Usage: node scripts/import_tank_master.mjs path/to/SOD_MIS.xlsx [--dry-run]

import "dotenv/config";
import ExcelJS from "exceljs";
import { Pool } from "pg";
import { cellToString } from "./_importCommon.mjs";

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const xlsxPath = process.argv[2];
const dryRun = process.argv.includes("--dry-run");
if (!xlsxPath) {
  console.error("Usage: node scripts/import_tank_master.mjs path/to/SOD_MIS.xlsx [--dry-run]");
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

let created = 0;
let skipped = 0;
const skipReasons = [];

try {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(xlsxPath);
  const sheet = wb.getWorksheet("TankMaster");
  if (!sheet) {
    console.error('Could not find "TankMaster" sheet in the workbook.');
    process.exit(1);
  }

  const locationCodes = new Set((await pool.query("select code from locations")).rows.map((l) => l.code));
  const seen = new Set();

  for (const r of sheetRows(sheet)) {
    const locationCode = cellToString(r["Location Code"]);
    const tankNo = cellToString(r["Tank No."]);
    if (!locationCode || !tankNo) {
      skipped++;
      skipReasons.push(`blank row near "${locationCode || "?"}"`);
      continue;
    }
    if (!locationCodes.has(locationCode)) {
      skipped++;
      skipReasons.push(`${locationCode} ${tankNo}: unknown location`);
      continue;
    }
    const dedupeKey = `${locationCode}|${tankNo}`;
    if (seen.has(dedupeKey)) continue; // duplicate row in the sheet
    seen.add(dedupeKey);

    if (dryRun) {
      created++;
      continue;
    }
    await pool.query(
      `insert into tank_master (location_code, tank_no) values ($1, $2) on conflict (location_code, tank_no) do nothing`,
      [locationCode, tankNo]
    );
    created++;
  }

  console.log(`${dryRun ? "[DRY RUN] " : ""}Import complete: ${created} tank(s), ${skipped} skipped.`);
  if (skipReasons.length) {
    console.log("\nSkipped rows:");
    for (const reason of skipReasons.slice(0, 30)) console.log(`  - ${reason}`);
    if (skipReasons.length > 30) console.log(`  ... and ${skipReasons.length - 30} more`);
  }
} finally {
  await pool.end();
}
