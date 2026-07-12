import { Router } from "express";
import { pool } from "../db/pool";
import { requireAuth, requireRole } from "../middleware/requireAuth";
import { logAudit } from "../auditLog";

export const zoneRouter = Router();

function monthYearToDate(monthYear: string): string {
  if (!/^\d{4}-\d{2}$/.test(monthYear)) throw new Error("monthYear must be in YYYY-MM format");
  return `${monthYear}-01`;
}

// Locations + their submission status for a given month, scoped to the caller's zone
// (Admin sees every location). This is the Zone dashboard's core data.
zoneRouter.get("/locations", requireAuth, requireRole("Zone", "Admin"), async (req, res) => {
  const monthYear = req.query.monthYear as string | undefined;
  if (!monthYear) {
    res.status(400).json({ error: "monthYear query param is required" });
    return;
  }
  let monthDate: string;
  try {
    monthDate = monthYearToDate(monthYear);
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
    return;
  }

  const zoneFilter = req.user!.role === "Admin" ? null : req.user!.zoneId;
  const result = await pool.query(
    `select l.code as location_code, l.name as location_name, l.loc_type,
            coalesce(ms.status, 'NOT_STARTED') as status,
            coalesce(ms.completion_pct, 0) as completion_pct
     from locations l
     left join monthly_submissions ms on ms.location_code = l.code and ms.month_year = $1
     where ($2::bigint is null or l.zone_id = $2)
       and l.active = true
     order by l.name`,
    [monthDate, zoneFilter]
  );
  res.json({ locations: result.rows });
});

zoneRouter.post("/revision-requests", requireAuth, requireRole("Zone"), async (req, res) => {
  const { locationCode, monthYear, reason } = req.body as {
    locationCode?: string;
    monthYear?: string;
    reason?: string;
  };
  if (!locationCode || !monthYear || !reason?.trim()) {
    res.status(400).json({ error: "locationCode, monthYear, and reason are all required" });
    return;
  }
  let monthDate: string;
  try {
    monthDate = monthYearToDate(monthYear);
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
    return;
  }

  const locResult = await pool.query("select zone_id from locations where code = $1", [locationCode]);
  if (!locResult.rows[0] || locResult.rows[0].zone_id !== req.user!.zoneId) {
    res.status(403).json({ error: "forbidden", message: "That location is not in your zone" });
    return;
  }

  const subResult = await pool.query(
    "select status from monthly_submissions where location_code = $1 and month_year = $2",
    [locationCode, monthDate]
  );
  if (subResult.rows[0]?.status !== "SUBMITTED") {
    res.status(409).json({ error: "not_submitted", message: "Only an already-submitted month can have a revision requested" });
    return;
  }

  const existing = await pool.query(
    "select id from revision_requests where location_code = $1 and month_year = $2 and status = 'PENDING'",
    [locationCode, monthDate]
  );
  if ((existing.rowCount ?? 0) > 0) {
    res.status(409).json({ error: "already_pending", message: "A revision request is already pending for this month" });
    return;
  }

  const result = await pool.query(
    `insert into revision_requests (location_code, month_year, requested_by, reason)
     values ($1, $2, $3, $4) returning id`,
    [locationCode, monthDate, req.user!.sub, reason.trim()]
  );
  await logAudit({
    actorUserId: req.user!.sub,
    actorLocationCode: locationCode,
    action: "RevisionRequest",
    entityType: "revision_request",
    entityId: String(result.rows[0].id),
    details: { monthYear, reason },
  });
  res.json({ ok: true, id: result.rows[0].id });
});

zoneRouter.get("/revision-requests", requireAuth, requireRole("Zone", "Admin"), async (req, res) => {
  const zoneFilter = req.user!.role === "Admin" ? null : req.user!.zoneId;
  const result = await pool.query(
    `select rr.id, rr.location_code, l.name as location_name, rr.month_year, rr.reason, rr.status,
            rr.requested_by, rr.actioned_by, rr.actioned_at, rr.created_at
     from revision_requests rr
     join locations l on l.code = rr.location_code
     where ($1::bigint is null or l.zone_id = $1)
     order by rr.created_at desc`,
    [zoneFilter]
  );
  res.json({ requests: result.rows });
});

zoneRouter.patch("/revision-requests/:id/approve", requireAuth, requireRole("Admin"), async (req, res) => {
  const id = Number(req.params.id);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const rrResult = await client.query("select * from revision_requests where id = $1 for update", [id]);
    const rr = rrResult.rows[0];
    if (!rr || rr.status !== "PENDING") {
      await client.query("ROLLBACK");
      res.status(409).json({ error: "not_pending" });
      return;
    }
    await client.query(
      "update revision_requests set status = 'APPROVED', actioned_by = $1, actioned_at = now() where id = $2",
      [req.user!.sub, id]
    );
    // Reuses REJECTED to unlock the month for editing, same as the original app's revision
    // flow — the Maker can now edit and resubmit.
    await client.query(
      `update monthly_submissions
       set status = 'REJECTED', checker_notes = $1, last_updated_at = now()
       where location_code = $2 and month_year = $3`,
      [`Correction approved by HQO: ${rr.reason}`, rr.location_code, rr.month_year]
    );
    await client.query("COMMIT");
    await logAudit({
      actorUserId: req.user!.sub,
      actorLocationCode: rr.location_code,
      action: "ApproveRevision",
      entityType: "revision_request",
      entityId: String(id),
    });
    res.json({ ok: true });
  } catch (e) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: "Failed to approve", message: (e as Error).message });
  } finally {
    client.release();
  }
});

zoneRouter.patch("/revision-requests/:id/reject", requireAuth, requireRole("Admin"), async (req, res) => {
  const id = Number(req.params.id);
  const result = await pool.query(
    "update revision_requests set status = 'REJECTED', actioned_by = $1, actioned_at = now() where id = $2 and status = 'PENDING' returning id, location_code",
    [req.user!.sub, id]
  );
  if (result.rowCount === 0) {
    res.status(409).json({ error: "not_pending" });
    return;
  }
  await logAudit({
    actorUserId: req.user!.sub,
    actorLocationCode: result.rows[0].location_code,
    action: "RejectRevision",
    entityType: "revision_request",
    entityId: String(id),
  });
  res.json({ ok: true });
});
