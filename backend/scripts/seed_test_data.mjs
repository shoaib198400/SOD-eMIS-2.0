import "dotenv/config";
import { Pool } from "pg";
import bcrypt from "bcryptjs";

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

try {
  const zoneRes = await pool.query(
    "insert into zones (name) values ('Test Zone') on conflict (name) do update set name = excluded.name returning id"
  );
  const zoneId = zoneRes.rows[0].id;

  await pool.query(
    `insert into locations (code, name, loc_type, zone_id)
     values ('TESTLOC1', 'Test Location 1', 'HPCL', $1)
     on conflict (code) do update set name = excluded.name, zone_id = excluded.zone_id`,
    [zoneId]
  );

  const passwordHash = await bcrypt.hash("Test@1234", 10);
  await pool.query(
    `insert into users (login_code, location_code, zone_id, role, password_hash, is_first_login)
     values ('TESTLOC1', 'TESTLOC1', $1, 'Maker', $2, false)
     on conflict (login_code) do update set password_hash = excluded.password_hash`,
    [zoneId, passwordHash]
  );

  const checkerHash = await bcrypt.hash("Test@1234", 10);
  await pool.query(
    `insert into users (login_code, location_code, zone_id, role, password_hash, is_first_login)
     values ('TESTLOC1C', 'TESTLOC1', $1, 'Checker', $2, false)
     on conflict (login_code) do update set password_hash = excluded.password_hash`,
    [zoneId, checkerHash]
  );

  await pool.query(
    `insert into tank_master (location_code, tank_no) values ('TESTLOC1','TK-101'), ('TESTLOC1','TK-102')
     on conflict (location_code, tank_no) do nothing`
  );

  console.log("Seeded: zone 'Test Zone', location 'TESTLOC1', tank master (TK-101, TK-102)");
  console.log("  Maker:   TESTLOC1  / Test@1234");
  console.log("  Checker: TESTLOC1C / Test@1234");
} catch (e) {
  console.error("Seed failed:", e.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
