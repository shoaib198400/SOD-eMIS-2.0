import { Router } from "express";
import { pool } from "../db/pool";
import { requireAuth } from "../middleware/requireAuth";
import { logAudit } from "../auditLog";

export const helpdeskRouter = Router();

// Any authenticated user tied to a location (Maker/Checker) can file a ticket for that
// location — matches the original app's location-centric help-request pattern.
helpdeskRouter.post("/tickets", requireAuth, async (req, res) => {
  const { issueType, issueDesc } = req.body as { issueType?: string; issueDesc?: string };
  if (!req.user!.locationCode) {
    res.status(400).json({ error: "This role has no associated location to file a ticket for" });
    return;
  }
  if (!issueType?.trim() || !issueDesc?.trim()) {
    res.status(400).json({ error: "issueType and issueDesc are required" });
    return;
  }

  const result = await pool.query(
    `insert into helpdesk_tickets (location_code, user_id, issue_type, issue_desc)
     values ($1, $2, $3, $4) returning id`,
    [req.user!.locationCode, req.user!.sub, issueType.trim(), issueDesc.trim()]
  );
  await logAudit({
    actorUserId: req.user!.sub,
    actorLocationCode: req.user!.locationCode,
    action: "HelpRequest",
    entityType: "helpdesk_ticket",
    entityId: String(result.rows[0].id),
  });
  res.json({ ok: true, id: result.rows[0].id });
});

// A user can see their own location's tickets (Maker/Checker); Admin sees everything via
// the /api/admin/helpdesk-tickets route instead.
helpdeskRouter.get("/tickets", requireAuth, async (req, res) => {
  if (!req.user!.locationCode) {
    res.json({ tickets: [] });
    return;
  }
  const result = await pool.query(
    "select * from helpdesk_tickets where location_code = $1 order by created_at desc",
    [req.user!.locationCode]
  );
  res.json({ tickets: result.rows });
});
