import { Router, Request } from "express";
import { PoolClient } from "pg";
import { pool } from "../db/pool";
import { requireAuth, requireRole } from "../middleware/requireAuth";
import { SECTION_FIELDS } from "../formDefs";
import { evaluateAutoCalc } from "../autoCalc";
import { computeOverallCompletion } from "../completion";

export const submissionsRouter = Router();

function monthYearToDate(monthYear: string): string {
  // Accepts "YYYY-MM" from the URL, stores as first-of-month "YYYY-MM-01".
  if (!/^\d{4}-\d{2}$/.test(monthYear)) {
    throw new Error("monthYear must be in YYYY-MM format");
  }
  return `${monthYear}-01`;
}

function checkOwnership(req: Request, locationCode: string): boolean {
  const user = req.user!;
  return user.role === "Admin" || user.locationCode === locationCode;
}

async function getLocType(locationCode: string): Promise<string> {
  const result = await pool.query("select loc_type from locations where code = $1", [locationCode]);
  if (!result.rows[0]) throw new Error("Unknown location");
  return result.rows[0].loc_type;
}

function withAutoCalc(rawValues: Record<string, string>): Record<string, string> {
  const merged: Record<string, string> = { ...rawValues };
  for (const fields of Object.values(SECTION_FIELDS)) {
    for (const field of fields) {
      if (!field.auto) continue;
      const computed = evaluateAutoCalc(field.auto, merged);
      merged[field.key] = computed === null ? "" : String(computed);
    }
  }
  return merged;
}

async function loadAllValues(client: PoolClient | typeof pool, submissionId: number): Promise<Record<string, string>> {
  const result = await client.query("select field_key, value from field_values where submission_id = $1", [
    submissionId,
  ]);
  const values: Record<string, string> = {};
  for (const row of result.rows) values[row.field_key] = row.value;
  return values;
}

async function findSubmission(locationCode: string, monthDate: string) {
  const result = await pool.query(
    "select id, status, completion_pct, checker_notes from monthly_submissions where location_code = $1 and month_year = $2",
    [locationCode, monthDate]
  );
  return result.rows[0] ?? null;
}

submissionsRouter.get("/:locationCode/:monthYear", requireAuth, async (req, res) => {
  const locationCode = req.params.locationCode as string;
  const monthYear = req.params.monthYear as string;
  if (!checkOwnership(req, locationCode)) {
    res.status(403).json({ error: "forbidden" });
    return;
  }

  let monthDate: string;
  try {
    monthDate = monthYearToDate(monthYear);
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
    return;
  }

  const locType = await getLocType(locationCode);
  const submission = await findSubmission(locationCode, monthDate);
  if (!submission) {
    const { sectionsComplete } = computeOverallCompletion(locType, {});
    res.json({ status: "NOT_STARTED", completionPct: 0, checkerNotes: null, values: {}, sectionsComplete });
    return;
  }

  const rawValues = await loadAllValues(pool, submission.id);
  const { sectionsComplete } = computeOverallCompletion(locType, rawValues);

  res.json({
    status: submission.status,
    completionPct: Number(submission.completion_pct),
    checkerNotes: submission.checker_notes,
    values: withAutoCalc(rawValues),
    sectionsComplete,
  });
});

submissionsRouter.patch(
  "/:locationCode/:monthYear/sections/:sectionNo",
  requireAuth,
  requireRole("Maker"),
  async (req, res) => {
    const locationCode = req.params.locationCode as string;
    const monthYear = req.params.monthYear as string;
    const sectionNo = req.params.sectionNo as string;
    if (!checkOwnership(req, locationCode)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }

    const sectionNum = Number(sectionNo);
    const fields = SECTION_FIELDS[sectionNum];
    if (!fields) {
      res.status(400).json({ error: "Unknown section" });
      return;
    }

    let monthDate: string;
    try {
      monthDate = monthYearToDate(monthYear);
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
      return;
    }

    const incoming = (req.body?.values ?? {}) as Record<string, string>;
    const validKeys = new Set(fields.filter((f) => !f.auto).map((f) => f.key));
    const toSave: Record<string, string> = {};
    for (const [key, value] of Object.entries(incoming)) {
      if (validKeys.has(key)) toSave[key] = value ?? "";
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      await client.query(
        `insert into monthly_submissions (location_code, month_year)
         values ($1, $2)
         on conflict (location_code, month_year) do nothing`,
        [locationCode, monthDate]
      );
      const subResult = await client.query(
        "select id, status from monthly_submissions where location_code = $1 and month_year = $2 for update",
        [locationCode, monthDate]
      );
      const submission = subResult.rows[0];

      if (submission.status === "SUBMITTED" || submission.status === "PENDING_REVIEW") {
        await client.query("ROLLBACK");
        res.status(409).json({ error: "locked", message: "This month is locked and cannot be edited" });
        return;
      }

      for (const [key, value] of Object.entries(toSave)) {
        await client.query(
          `insert into field_values (submission_id, field_key, value, updated_at)
           values ($1, $2, $3, now())
           on conflict (submission_id, field_key) do update set value = excluded.value, updated_at = now()`,
          [submission.id, key, value]
        );
      }

      const allValues = await loadAllValues(client, submission.id);
      const locType = await getLocType(locationCode);
      const { completionPct, sectionsComplete } = computeOverallCompletion(locType, allValues);
      const hasAnyValue = Object.values(allValues).some((v) => v !== "");
      const newStatus = hasAnyValue ? "IN_PROGRESS" : "NOT_STARTED";

      await client.query(
        "update monthly_submissions set status = $1, completion_pct = $2, last_updated_at = now() where id = $3",
        [newStatus, completionPct, submission.id]
      );

      await client.query("COMMIT");
      res.json({
        status: newStatus,
        completionPct,
        sectionComplete: sectionsComplete[sectionNum],
        sectionsComplete,
        values: withAutoCalc(allValues),
      });
    } catch (e) {
      await client.query("ROLLBACK");
      res.status(500).json({ error: "Failed to save section", message: (e as Error).message });
    } finally {
      client.release();
    }
  }
);

submissionsRouter.post(
  "/:locationCode/:monthYear/submit",
  requireAuth,
  requireRole("Maker"),
  async (req, res) => {
    const locationCode = req.params.locationCode as string;
    const monthYear = req.params.monthYear as string;
    if (!checkOwnership(req, locationCode)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }

    let monthDate: string;
    try {
      monthDate = monthYearToDate(monthYear);
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const subResult = await client.query(
        "select id, status from monthly_submissions where location_code = $1 and month_year = $2 for update",
        [locationCode, monthDate]
      );
      const submission = subResult.rows[0];
      if (!submission) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "No draft exists for this month yet" });
        return;
      }
      if (["SUBMITTED", "PENDING_REVIEW"].includes(submission.status)) {
        await client.query("ROLLBACK");
        res.status(409).json({ error: "already_submitted", message: "This month is already submitted" });
        return;
      }

      const allValues = await loadAllValues(client, submission.id);
      const locType = await getLocType(locationCode);
      const { sectionsComplete } = computeOverallCompletion(locType, allValues);
      const incompleteSections = Object.entries(sectionsComplete)
        .filter(([, complete]) => !complete)
        .map(([s]) => Number(s));

      if (incompleteSections.length > 0) {
        await client.query("ROLLBACK");
        res.status(400).json({
          error: "incomplete",
          message: "All required sections must be complete before submitting",
          incompleteSections,
        });
        return;
      }

      await client.query(
        "update monthly_submissions set status = 'PENDING_REVIEW', submitted_at = now(), last_updated_at = now() where id = $1",
        [submission.id]
      );
      await client.query("COMMIT");
      res.json({ status: "PENDING_REVIEW" });
    } catch (e) {
      await client.query("ROLLBACK");
      res.status(500).json({ error: "Failed to submit", message: (e as Error).message });
    } finally {
      client.release();
    }
  }
);

submissionsRouter.post(
  "/:locationCode/:monthYear/approve",
  requireAuth,
  requireRole("Checker"),
  async (req, res) => {
    const locationCode = req.params.locationCode as string;
    const monthYear = req.params.monthYear as string;
    if (!checkOwnership(req, locationCode)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }

    let monthDate: string;
    try {
      monthDate = monthYearToDate(monthYear);
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const subResult = await client.query(
        "select id, status from monthly_submissions where location_code = $1 and month_year = $2 for update",
        [locationCode, monthDate]
      );
      const submission = subResult.rows[0];
      if (!submission || submission.status !== "PENDING_REVIEW") {
        await client.query("ROLLBACK");
        res.status(409).json({ error: "not_pending", message: "This month is not awaiting review" });
        return;
      }

      const allValues = await loadAllValues(client, submission.id);
      const snapshot = withAutoCalc(allValues);

      await client.query(
        `insert into approved_snapshots (submission_id, location_code, month_year, snapshot, approved_by, approved_at)
         values ($1, $2, $3, $4, $5, now())
         on conflict (submission_id) do update
           set snapshot = excluded.snapshot, approved_by = excluded.approved_by, approved_at = now()`,
        [submission.id, locationCode, monthDate, JSON.stringify(snapshot), req.user!.sub]
      );

      await client.query(
        `update monthly_submissions
         set status = 'SUBMITTED', locked_by = $1, locked_at = now(), last_updated_at = now()
         where id = $2`,
        [req.user!.sub, submission.id]
      );

      await client.query("COMMIT");
      res.json({ status: "SUBMITTED" });
    } catch (e) {
      await client.query("ROLLBACK");
      res.status(500).json({ error: "Failed to approve", message: (e as Error).message });
    } finally {
      client.release();
    }
  }
);

submissionsRouter.post(
  "/:locationCode/:monthYear/reject",
  requireAuth,
  requireRole("Checker"),
  async (req, res) => {
    const locationCode = req.params.locationCode as string;
    const monthYear = req.params.monthYear as string;
    const note = (req.body?.note ?? "").trim();
    if (!checkOwnership(req, locationCode)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    if (!note) {
      res.status(400).json({ error: "A rejection note is required" });
      return;
    }

    let monthDate: string;
    try {
      monthDate = monthYearToDate(monthYear);
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
      return;
    }

    const result = await pool.query(
      `update monthly_submissions
       set status = 'REJECTED', checker_notes = $1, last_updated_at = now()
       where location_code = $2 and month_year = $3 and status = 'PENDING_REVIEW'
       returning id`,
      [note, locationCode, monthDate]
    );
    if (result.rowCount === 0) {
      res.status(409).json({ error: "not_pending", message: "This month is not awaiting review" });
      return;
    }
    res.json({ status: "REJECTED" });
  }
);

submissionsRouter.post(
  "/:locationCode/:monthYear/reset",
  requireAuth,
  requireRole("Maker", "Checker", "Admin"),
  async (req, res) => {
    const locationCode = req.params.locationCode as string;
    const monthYear = req.params.monthYear as string;
    const reason = (req.body?.reason ?? "").trim();
    if (!checkOwnership(req, locationCode)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    if (!reason) {
      res.status(400).json({ error: "A reason is required" });
      return;
    }

    let monthDate: string;
    try {
      monthDate = monthYearToDate(monthYear);
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const subResult = await client.query(
        "select id, status from monthly_submissions where location_code = $1 and month_year = $2 for update",
        [locationCode, monthDate]
      );
      const submission = subResult.rows[0];
      if (!submission) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "No draft exists for this month" });
        return;
      }

      const role = req.user!.role;
      const blocked =
        role === "Maker"
          ? ["SUBMITTED", "PENDING_REVIEW"].includes(submission.status)
          : role === "Checker"
            ? submission.status === "SUBMITTED"
            : false; // Admin can always reset
      if (blocked) {
        await client.query("ROLLBACK");
        res.status(409).json({ error: "locked", message: "This month cannot be reset in its current state" });
        return;
      }

      // Full wipe (fields + detail tables) — the original app only cleared main fields here,
      // leaving detail-table/M&I data stranded; this rewrite deliberately fixes that gap.
      await client.query("delete from field_values where submission_id = $1", [submission.id]);
      await client.query("delete from detail_rows where submission_id = $1", [submission.id]);
      await client.query(
        `update monthly_submissions
         set status = 'NOT_STARTED', completion_pct = 0, submitted_at = null, locked_by = null, locked_at = null,
             checker_notes = $1, last_updated_at = now()
         where id = $2`,
        [`[RESET by ${req.user!.sub}] ${reason}`, submission.id]
      );

      await client.query("COMMIT");
      res.json({ status: "NOT_STARTED" });
    } catch (e) {
      await client.query("ROLLBACK");
      res.status(500).json({ error: "Failed to reset", message: (e as Error).message });
    } finally {
      client.release();
    }
  }
);

const DETAIL_TABLE_TYPES = new Set(["RAILWAY_CLAIM", "IRR_DETAIL", "LEGAL_CASE"]);

submissionsRouter.get(
  "/:locationCode/:monthYear/detail-tables/:tableType",
  requireAuth,
  async (req, res) => {
    const locationCode = req.params.locationCode as string;
    const monthYear = req.params.monthYear as string;
    const tableType = req.params.tableType as string;
    if (!checkOwnership(req, locationCode)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    if (!DETAIL_TABLE_TYPES.has(tableType)) {
      res.status(400).json({ error: "Unknown detail table type" });
      return;
    }

    let monthDate: string;
    try {
      monthDate = monthYearToDate(monthYear);
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
      return;
    }

    const submission = await findSubmission(locationCode, monthDate);
    if (!submission) {
      res.json({ rows: [] });
      return;
    }
    const result = await pool.query(
      "select id, row_data from detail_rows where submission_id = $1 and table_type = $2 order by sort_order asc, id asc",
      [submission.id, tableType]
    );
    res.json({ rows: result.rows.map((r) => ({ id: r.id, ...r.row_data })) });
  }
);

submissionsRouter.put(
  "/:locationCode/:monthYear/detail-tables/:tableType",
  requireAuth,
  requireRole("Maker"),
  async (req, res) => {
    const locationCode = req.params.locationCode as string;
    const monthYear = req.params.monthYear as string;
    const tableType = req.params.tableType as string;
    if (!checkOwnership(req, locationCode)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    if (!DETAIL_TABLE_TYPES.has(tableType)) {
      res.status(400).json({ error: "Unknown detail table type" });
      return;
    }

    let monthDate: string;
    try {
      monthDate = monthYearToDate(monthYear);
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
      return;
    }

    const rows = (req.body?.rows ?? []) as Record<string, unknown>[];

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `insert into monthly_submissions (location_code, month_year)
         values ($1, $2)
         on conflict (location_code, month_year) do nothing`,
        [locationCode, monthDate]
      );
      const subResult = await client.query(
        "select id, status from monthly_submissions where location_code = $1 and month_year = $2 for update",
        [locationCode, monthDate]
      );
      const submission = subResult.rows[0];
      if (submission.status === "SUBMITTED" || submission.status === "PENDING_REVIEW") {
        await client.query("ROLLBACK");
        res.status(409).json({ error: "locked", message: "This month is locked and cannot be edited" });
        return;
      }

      // Simple full-replace-on-save for Phase 2, matching the original app's semantics;
      // the schema already gives each row a stable id if per-row editing is added later.
      await client.query("delete from detail_rows where submission_id = $1 and table_type = $2", [
        submission.id,
        tableType,
      ]);
      let sortOrder = 0;
      for (const row of rows) {
        const { id: _ignored, ...rowData } = row;
        await client.query(
          "insert into detail_rows (submission_id, table_type, row_data, sort_order) values ($1, $2, $3, $4)",
          [submission.id, tableType, JSON.stringify(rowData), sortOrder++]
        );
      }
      await client.query("update monthly_submissions set last_updated_at = now() where id = $1", [submission.id]);

      await client.query("COMMIT");
      const result = await pool.query(
        "select id, row_data from detail_rows where submission_id = $1 and table_type = $2 order by sort_order asc, id asc",
        [submission.id, tableType]
      );
      res.json({ rows: result.rows.map((r) => ({ id: r.id, ...r.row_data })) });
    } catch (e) {
      await client.query("ROLLBACK");
      res.status(500).json({ error: "Failed to save detail table", message: (e as Error).message });
    } finally {
      client.release();
    }
  }
);
