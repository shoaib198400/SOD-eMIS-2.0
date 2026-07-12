// One-time migration: import login credentials from the original app's "UserAccess" Google
// Sheet tab (exported as CSV) into the new Postgres `users` table, preserving each user's
// existing plaintext password and is_first_login flag so nobody is forced to reset anything.
//
// Real exported columns: LocationCode, LocationName, ZoneName, Password, Role, IsFirstLogin,
// LastLogin, PasswordChangedAt. Passwords are plaintext; bcrypt-hashed here but the value a
// user types to log in stays identical.
//
// Maker and Checker rows for the SAME location share the same LocationCode value (there's no
// separate stored login id for Checker) — the app derives the Checker's actual login as
// LocationCode + "C", which is what we construct here too, matching this app's own convention
// (see admin.ts's sync-missing-location-accounts). Zone/Admin/Viewer rows carry their real
// login code directly in LocationCode (e.g. BENZONE, SODSBU); their ZoneName is sometimes the
// literal "ALL", which is ignored rather than treated as a real zone.
//
// Requires LocationMaster to already be imported (run import_location_master.mjs first) —
// Maker/Checker rows are skipped if their location doesn't exist yet.
//
// Usage: node scripts/import_user_access.mjs path/to/UserAccess.csv [--dry-run]

import "dotenv/config";
import { readFileSync } from "fs";
import { Pool } from "pg";
import bcrypt from "bcryptjs";

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const csvPath = process.argv[2];
const dryRun = process.argv.includes("--dry-run");
if (!csvPath) {
  console.error("Usage: node scripts/import_user_access.mjs path/to/UserAccess.csv [--dry-run]");
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
  locationCode: col(["locationcode", "userid", "user_id", "logincode"]),
  locationName: col(["locationname", "location_name"]),
  zone: col(["zonename", "zone"]),
  password: col(["password"]),
  role: col(["role"]),
  isFirstLogin: col(["isfirstlogin", "is_first_login"]),
};

if (idx.locationCode === -1 || idx.password === -1 || idx.role === -1) {
  console.error("Could not find required columns (LocationCode, Password, Role) in CSV header:", rows[0]);
  process.exit(1);
}

const VALID_ROLES = new Set(["Maker", "Checker", "Zone", "Admin", "Viewer"]);

let created = 0;
let updated = 0;
let skipped = 0;
const skipReasons = [];

try {
  const zoneCache = new Map((await pool.query("select id, name from zones")).rows.map((z) => [z.name.trim().toLowerCase(), z.id]));
  const locations = new Map((await pool.query("select code, zone_id from locations")).rows.map((l) => [l.code, l.zone_id]));
  const zonesCreated = new Set();
  const seenLoginCodes = new Set();

  for (const r of rows.slice(1)) {
    const csvLocationCode = (r[idx.locationCode] ?? "").trim();
    const password = (r[idx.password] ?? "").trim();
    const role = (r[idx.role] ?? "").trim();
    const zoneName = idx.zone !== -1 ? (r[idx.zone] ?? "").trim() : "";
    const isFirstLoginRaw = idx.isFirstLogin !== -1 ? (r[idx.isFirstLogin] ?? "").trim().toUpperCase() : "";
    // Blank is treated as "not first login" — most blank rows here are established accounts
    // with LastLogin history, not brand-new ones, so defaulting to true would force needless
    // password resets on people who've been using the app for months.
    const isFirstLogin = isFirstLoginRaw === "TRUE";

    if (!csvLocationCode || !password || !role) {
      skipped++;
      skipReasons.push(`(blank row near "${csvLocationCode || "?"}") missing location code/password/role`);
      continue;
    }
    if (!VALID_ROLES.has(role)) {
      skipped++;
      skipReasons.push(`${csvLocationCode}: unrecognized role "${role}"`);
      continue;
    }

    let loginCode = csvLocationCode;
    if (role === "Checker") loginCode = `${csvLocationCode}C`;
    // Sheets sometimes carry a stale leftover duplicate row (same login, slightly different
    // zone text) — first occurrence wins rather than letting a later row silently overwrite it.
    if (seenLoginCodes.has(loginCode)) {
      skipped++;
      skipReasons.push(`${loginCode}: duplicate row in the sheet, ignoring (kept the first occurrence)`);
      continue;
    }
    seenLoginCodes.add(loginCode);

    let locationCode = null;
    let zoneId = null;

    if (role === "Maker" || role === "Checker") {
      locationCode = csvLocationCode;
      if (!locations.has(locationCode)) {
        skipped++;
        skipReasons.push(`${loginCode}: location "${locationCode}" doesn't exist yet in the locations table (import LocationMaster first)`);
        continue;
      }
      zoneId = locations.get(locationCode); // inherit from the location, not the CSV's zone text
    } else if (role === "Zone") {
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
    }
    // Admin/Viewer: locationCode and zoneId stay null regardless of the CSV's ZoneName
    // (often the literal "ALL", not a real zone).

    const passwordHash = await bcrypt.hash(password, 10);

    if (dryRun) {
      created++;
      continue;
    }

    const result = await pool.query(
      `insert into users (login_code, location_code, zone_id, role, password_hash, is_first_login, active)
       values ($1, $2, $3, $4, $5, $6, true)
       on conflict (login_code) do update set
         location_code = excluded.location_code,
         zone_id = excluded.zone_id,
         role = excluded.role,
         password_hash = excluded.password_hash,
         is_first_login = excluded.is_first_login,
         active = true
       returning (xmax = 0) as inserted`,
      [loginCode, locationCode, zoneId, role, passwordHash, isFirstLogin]
    );
    if (result.rows[0].inserted) created++;
    else updated++;
  }
  if (zonesCreated.size) {
    console.log(`${dryRun ? "[DRY RUN] " : ""}New zones from Zone-role rows: ${[...zonesCreated].join(", ")}`);
  }

  console.log(`${dryRun ? "[DRY RUN] " : ""}Import complete: ${created} created, ${updated} updated, ${skipped} skipped.`);
  if (skipReasons.length) {
    console.log("\nSkipped rows:");
    for (const reason of skipReasons) console.log(`  - ${reason}`);
  }
} finally {
  await pool.end();
}
