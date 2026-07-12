// One-time migration: import zones + locations from the original app's "LocationMaster"
// Google Sheet tab (exported as CSV) into Postgres. Must run BEFORE import_user_access.mjs,
// since Maker/Checker accounts there are skipped if their location doesn't exist yet.
//
// Original sheet columns: PlantCode, PlantName, Loc_Type (HPCL|TOP|HMEL), ZoneName,
// ToEmail, CCEmail, Active (Yes/No).
//
// Usage: node scripts/import_location_master.mjs path/to/LocationMaster.csv [--dry-run]

import "dotenv/config";
import { readFileSync } from "fs";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const csvPath = process.argv[2];
const dryRun = process.argv.includes("--dry-run");
if (!csvPath) {
  console.error("Usage: node scripts/import_location_master.mjs path/to/LocationMaster.csv [--dry-run]");
  process.exit(1);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

function normalizeHeader(h) {
  return h.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

const raw = readFileSync(csvPath, "utf8");
const rows = parseCsv(raw);
if (rows.length === 0) {
  console.error("CSV is empty");
  process.exit(1);
}

const header = rows[0].map(normalizeHeader);
const col = (names) => {
  for (const n of names) {
    const idx = header.indexOf(n);
    if (idx !== -1) return idx;
  }
  return -1;
};

const idx = {
  code: col(["plantcode", "code", "locationcode"]),
  name: col(["plantname", "name", "locationname"]),
  locType: col(["loctype", "loc_type"]),
  zone: col(["zonename", "zone"]),
  active: col(["active"]),
};

if (idx.code === -1 || idx.name === -1 || idx.locType === -1) {
  console.error("Could not find required columns (PlantCode, PlantName, Loc_Type) in CSV header:", rows[0]);
  process.exit(1);
}

const VALID_LOC_TYPES = new Set(["HPCL", "TOP", "HMEL"]);

let created = 0;
let updated = 0;
let skipped = 0;
const skipReasons = [];
const zonesCreated = new Set();

try {
  const zoneCache = new Map((await pool.query("select id, name from zones")).rows.map((z) => [z.name.trim().toLowerCase(), z.id]));

  for (const r of rows.slice(1)) {
    const code = (r[idx.code] ?? "").trim();
    const name = (r[idx.name] ?? "").trim();
    const locType = (r[idx.locType] ?? "").trim().toUpperCase();
    const zoneName = idx.zone !== -1 ? (r[idx.zone] ?? "").trim() : "";
    const activeRaw = idx.active !== -1 ? (r[idx.active] ?? "").trim().toUpperCase() : "YES";
    const active = activeRaw === "" ? true : activeRaw === "YES" || activeRaw === "TRUE";

    if (!code || !name) {
      skipped++;
      skipReasons.push(`(blank row near "${code || "?"}") missing code/name`);
      continue;
    }
    if (!VALID_LOC_TYPES.has(locType)) {
      skipped++;
      skipReasons.push(`${code}: unrecognized loc_type "${locType}" (must be HPCL/TOP/HMEL)`);
      continue;
    }

    let zoneId = null;
    if (zoneName) {
      zoneId = zoneCache.get(zoneName.toLowerCase()) ?? null;
      if (zoneId === null) {
        zonesCreated.add(zoneName);
        if (!dryRun) {
          const inserted = await pool.query(
            "insert into zones (name) values ($1) on conflict (name) do update set name = excluded.name returning id",
            [zoneName]
          );
          zoneId = inserted.rows[0].id;
          zoneCache.set(zoneName.toLowerCase(), zoneId);
        }
      }
    }

    if (dryRun) {
      created++;
      continue;
    }

    const result = await pool.query(
      `insert into locations (code, name, loc_type, zone_id, active)
       values ($1, $2, $3, $4, $5)
       on conflict (code) do update set
         name = excluded.name,
         loc_type = excluded.loc_type,
         zone_id = excluded.zone_id,
         active = excluded.active
       returning (xmax = 0) as inserted`,
      [code, name, locType, zoneId, active]
    );
    if (result.rows[0].inserted) created++;
    else updated++;
  }

  console.log(`${dryRun ? "[DRY RUN] " : ""}Import complete: ${created} created, ${updated} updated, ${skipped} skipped.`);
  if (zonesCreated.size) {
    console.log(`\nNew zones ${dryRun ? "that would be " : ""}created: ${[...zonesCreated].join(", ")}`);
  }
  if (skipReasons.length) {
    console.log("\nSkipped rows:");
    for (const reason of skipReasons) console.log(`  - ${reason}`);
  }
} finally {
  await pool.end();
}
