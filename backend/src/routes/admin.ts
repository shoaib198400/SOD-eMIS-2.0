import { Router } from "express";
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
