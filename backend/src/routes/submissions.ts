import { Router, Request } from "express";
import { pool } from "../db/pool";
import { requireAuth, requireRole } from "../middleware/requireAuth";
import { SECTION_FIELDS } from "../formDefs";
import { evaluateAutoCalc } from "../autoCalc";
import { isSectionComplete } from "../completion";

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

  const subResult = await pool.query(
    "select id, status, completion_pct, checker_notes from monthly_submissions where location_code = $1 and month_year = $2",
    [locationCode, monthDate]
  );
  const submission = subResult.rows[0];
  if (!submission) {
    res.json({ status: "NOT_STARTED", completionPct: 0, checkerNotes: null, values: {} });
    return;
  }

  const valuesResult = await pool.query(
    "select field_key, value from field_values where submission_id = $1",
    [submission.id]
  );
  const rawValues: Record<string, string> = {};
  for (const row of valuesResult.rows) rawValues[row.field_key] = row.value;

  res.json({
    status: submission.status,
    completionPct: Number(submission.completion_pct),
    checkerNotes: submission.checker_notes,
    values: withAutoCalc(rawValues),
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

      let subResult = await client.query(
        `insert into monthly_submissions (location_code, month_year)
         values ($1, $2)
         on conflict (location_code, month_year) do nothing`,
        [locationCode, monthDate]
      );
      subResult = await client.query(
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

      const allValuesResult = await client.query(
        "select field_key, value from field_values where submission_id = $1",
        [submission.id]
      );
      const allValues: Record<string, string> = {};
      for (const row of allValuesResult.rows) allValues[row.field_key] = row.value;

      const locType = await getLocType(locationCode);
      const sectionComplete = isSectionComplete(sectionNum, locType, allValues);
      // Phase 1 only wires up Section 1, so completion_pct just reflects that section for now;
      // Phase 2 generalizes this to all 10 sections once they're all built.
      const completionPct = sectionComplete ? 10 : 0;
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
        sectionComplete,
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
