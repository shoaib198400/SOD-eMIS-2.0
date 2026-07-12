import { Pool, types } from "pg";

// By default node-postgres parses `date` columns into JS Date objects at local midnight,
// and Express/JSON.stringify then calls toISOString() on them — which converts to UTC and
// shifts the date backward by a day in any timezone ahead of UTC (e.g. IST). Since we only
// ever store/compare month_year as a plain "YYYY-MM-DD" string, return it as-is (OID 1082
// = date) and skip the Date round-trip entirely.
types.setTypeParser(1082, (value: string) => value);

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("localhost") ? false : { rejectUnauthorized: false },
});
