import { Router } from "express";
import bcrypt from "bcryptjs";
import { pool } from "../db/pool";
import { requireAuth, requireRole } from "../middleware/requireAuth";
import { logAudit } from "../auditLog";

export const adminRouter = Router();
adminRouter.use(requireAuth, requireRole("Admin"));

adminRouter.get("/locations", async (_req, res) => {
  const result = await pool.query(
    `select l.code, l.name, l.loc_type, l.zone_id, z.name as zone_name, l.active, l.is_excluded
     from locations l left join zones z on z.id = l.zone_id
     order by l.name`
  );
  res.json({ locations: result.rows });
});

adminRouter.get("/zones", async (_req, res) => {
  const result = await pool.query("select id, name from zones order by name");
  res.json({ zones: result.rows });
});

adminRouter.patch("/locations/:code", async (req, res) => {
  const code = req.params.code as string;
  const { zoneId, isExcluded } = req.body as { zoneId?: number; isExcluded?: boolean };

  const updates: string[] = [];
  const values: unknown[] = [];
  if (zoneId !== undefined) {
    values.push(zoneId);
    updates.push(`zone_id = $${values.length}`);
  }
  if (isExcluded !== undefined) {
    values.push(isExcluded);
    updates.push(`is_excluded = $${values.length}`);
  }
  if (updates.length === 0) {
    res.status(400).json({ error: "Nothing to update" });
    return;
  }
  values.push(code);
  const result = await pool.query(
    `update locations set ${updates.join(", ")} where code = $${values.length} returning code`,
    values
  );
  if (result.rowCount === 0) {
    res.status(404).json({ error: "Location not found" });
    return;
  }
  await logAudit({
    actorUserId: req.user!.sub,
    action: "ZoneUpdate",
    entityType: "location",
    entityId: code,
    details: { zoneId, isExcluded },
  });
  res.json({ ok: true });
});

adminRouter.get("/helpdesk-tickets", async (req, res) => {
  const status = req.query.status as string | undefined;
  const result = await pool.query(
    status
      ? "select * from helpdesk_tickets where status = $1 order by created_at desc"
      : "select * from helpdesk_tickets order by created_at desc",
    status ? [status] : []
  );
  res.json({ tickets: result.rows });
});

adminRouter.patch("/helpdesk-tickets/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { response, status } = req.body as { response?: string; status?: string };
  if (!response?.trim() || !["RESPONDED", "CLOSED"].includes(status ?? "")) {
    res.status(400).json({ error: "response and a valid status (RESPONDED or CLOSED) are required" });
    return;
  }
  const result = await pool.query(
    `update helpdesk_tickets
     set admin_response = $1, status = $2, responded_at = now(), responded_by = $3
     where id = $4 returning id`,
    [response.trim(), status, req.user!.sub, id]
  );
  if (result.rowCount === 0) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }
  res.json({ ok: true });
});

adminRouter.get("/audit-log", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const result = await pool.query(
    `select al.id, al.occurred_at, al.actor_user_id, u.login_code as actor_login_code,
            al.actor_location_code, al.action, al.entity_type, al.entity_id, al.details
     from audit_log al left join users u on u.id = al.actor_user_id
     order by al.occurred_at desc limit $1`,
    [limit]
  );
  res.json({ entries: result.rows });
});

// Distinct-user login counts bucketed by hour for a given date, matching the original's
// "Portal Traffic" admin page (used to plan maintenance windows around real usage patterns).
adminRouter.get("/traffic", async (req, res) => {
  const date = req.query.date as string | undefined;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ error: "date query param (YYYY-MM-DD) is required" });
    return;
  }
  const result = await pool.query(
    `select extract(hour from occurred_at)::int as hour, count(distinct actor_user_id)::int as distinct_logins
     from audit_log
     where action = 'Login' and occurred_at::date = $1::date
     group by hour
     order by hour`,
    [date]
  );
  const byHour: Record<number, number> = {};
  for (const row of result.rows) byHour[row.hour] = row.distinct_logins;
  const hours = Array.from({ length: 24 }, (_, h) => ({ hour: h, distinctLogins: byHour[h] ?? 0 }));
  res.json({ date, hours });
});

// ── Admin bootstrap/maintenance tools ──────────────────────────────────────────
// Adapted from the original app's one-time Google-Sheets bootstrap utilities. Two of the
// originals don't have a sensible equivalent here and were intentionally not ported:
// "Fix Conflicting Zone IDs" corrected 5 hardcoded legacy zone names specific to the old
// system, and "Sync Tank Master -> Google Sheet" doesn't apply now that Tank Master lives
// directly in Postgres (replaced below by a direct CSV upload instead).

function shortCode(name: string): string {
  return name.replace(/[^a-zA-Z]/g, "").slice(0, 3).toUpperCase();
}

// Creates a Zone-role login for every zone that doesn't have one yet. Naming convention
// mirrors the original: first 3 letters of the zone name + "ZONE"/"MIS".
adminRouter.post("/setup-zone-accounts", async (req, res) => {
  const zonesResult = await pool.query(
    `select z.id, z.name from zones z
     where not exists (select 1 from users u where u.zone_id = z.id and u.role = 'Zone')`
  );
  const added: string[] = [];
  for (const zone of zonesResult.rows) {
    const loginCode = `${shortCode(zone.name)}ZONE`;
    const password = `${shortCode(zone.name)}MIS`;
    const passwordHash = await bcrypt.hash(password, 10);
    await pool.query(
      `insert into users (login_code, zone_id, role, password_hash, is_first_login)
       values ($1, $2, 'Zone', $3, true)
       on conflict (login_code) do nothing`,
      [loginCode, zone.id, passwordHash]
    );
    added.push(`${loginCode} (zone: ${zone.name})`);
  }
  await logAudit({ actorUserId: req.user!.sub, action: "SetupZoneAccounts", details: { added } });
  res.json({ ok: true, added });
});

// Creates Maker + Checker logins (default password = location code / location code + "C")
// for any location that's missing one, matching the original's "Sync Missing Location
// Accounts" behavior.
adminRouter.post("/sync-missing-location-accounts", async (req, res) => {
  const locationsResult = await pool.query("select code, zone_id from locations where active = true");
  const added: string[] = [];
  for (const loc of locationsResult.rows) {
    const makerExists = await pool.query("select 1 from users where login_code = $1", [loc.code]);
    if ((makerExists.rowCount ?? 0) === 0) {
      const hash = await bcrypt.hash(loc.code, 10);
      await pool.query(
        `insert into users (login_code, location_code, zone_id, role, password_hash, is_first_login)
         values ($1, $1, $2, 'Maker', $3, true)`,
        [loc.code, loc.zone_id, hash]
      );
      added.push(`${loc.code} (Maker)`);
    }
    const checkerCode = `${loc.code}C`;
    const checkerExists = await pool.query("select 1 from users where login_code = $1", [checkerCode]);
    if ((checkerExists.rowCount ?? 0) === 0) {
      const hash = await bcrypt.hash(loc.code, 10);
      await pool.query(
        `insert into users (login_code, location_code, zone_id, role, password_hash, is_first_login)
         values ($1, $2, $3, 'Checker', $4, true)`,
        [checkerCode, loc.code, loc.zone_id, hash]
      );
      added.push(`${checkerCode} (Checker)`);
    }
  }
  await logAudit({ actorUserId: req.user!.sub, action: "SyncMissingLocationAccounts", details: { added } });
  res.json({ ok: true, added });
});

// Diagnostic list of every Zone/Admin/Viewer account (the non-location-scoped roles),
// matching the original's "Audit Zone & HQO Accounts" view.
adminRouter.get("/zone-accounts", async (_req, res) => {
  const result = await pool.query(
    `select u.id, u.login_code, u.role, u.zone_id, z.name as zone_name, u.active, u.last_login_at
     from users u left join zones z on z.id = u.zone_id
     where u.role in ('Zone', 'Admin', 'Viewer')
     order by u.role, z.name nulls last`
  );
  res.json({ accounts: result.rows });
});

// Wipes all MIS data (submissions + everything cascading from them) for specific location
// codes — a pre-launch/test-data cleanup tool, same as the original's "Reset Location Data".
adminRouter.post("/reset-location-data", async (req, res) => {
  const { locationCodes } = req.body as { locationCodes?: string[] };
  if (!Array.isArray(locationCodes) || locationCodes.length === 0) {
    res.status(400).json({ error: "locationCodes (non-empty array) is required" });
    return;
  }
  const result = await pool.query(
    "delete from monthly_submissions where location_code = any($1::text[]) returning id",
    [locationCodes]
  );
  await logAudit({
    actorUserId: req.user!.sub,
    action: "ResetLocationData",
    details: { locationCodes, submissionsDeleted: result.rowCount },
  });
  res.json({ ok: true, submissionsDeleted: result.rowCount });
});

// Direct CSV upload for Tank Master (replaces the original's Google-Sheets sync step).
// Expects rows already parsed client-side: [{ locationCode, tankNo }, ...].
adminRouter.post("/tank-master/upload", async (req, res) => {
  const { rows } = req.body as { rows?: { locationCode: string; tankNo: string }[] };
  if (!Array.isArray(rows) || rows.length === 0) {
    res.status(400).json({ error: "rows (non-empty array) is required" });
    return;
  }
  let inserted = 0;
  for (const row of rows) {
    if (!row.locationCode || !row.tankNo) continue;
    const result = await pool.query(
      `insert into tank_master (location_code, tank_no) values ($1, $2)
       on conflict (location_code, tank_no) do nothing`,
      [row.locationCode.trim(), row.tankNo.trim()]
    );
    inserted += result.rowCount ?? 0;
  }
  await logAudit({ actorUserId: req.user!.sub, action: "SyncTankMaster", details: { rowsSubmitted: rows.length, inserted } });
  res.json({ ok: true, inserted });
});
