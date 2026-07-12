import { Router } from "express";
import { pool } from "../db/pool";
import { requireAuth, requireRole } from "../middleware/requireAuth";
import { MI_TABS, getMiTab, MiFieldDef } from "../miDefs";

export const miRouter = Router();

function monthYearToDate(monthYear: string): string {
  if (!/^\d{4}-\d{2}$/.test(monthYear)) throw new Error("monthYear must be in YYYY-MM format");
  return `${monthYear}-01`;
}

function checkOwnership(userRole: string, userLocationCode: string | null, locationCode: string): boolean {
  return userRole === "Admin" || userLocationCode === locationCode;
}

async function getTankOpts(locationCode: string): Promise<string[]> {
  const result = await pool.query("select tank_no from tank_master where location_code = $1 order by tank_no", [
    locationCode,
  ]);
  return [...result.rows.map((r) => r.tank_no), "Other Tanks"];
}

async function findSubmission(locationCode: string, monthDate: string) {
  const result = await pool.query(
    "select id, status from monthly_submissions where location_code = $1 and month_year = $2",
    [locationCode, monthDate]
  );
  return result.rows[0] ?? null;
}

function isFieldVisible(field: MiFieldDef, values: Record<string, string>): boolean {
  if (!field.showWhen) return true;
  return Object.entries(field.showWhen).every(([key, expected]) => values[key] === expected);
}

function validateRow(fields: MiFieldDef[], row: Record<string, string>): string | null {
  for (const field of fields) {
    if (!field.required) continue;
    if (!isFieldVisible(field, row)) continue;
    const v = row[field.key];
    if (v === undefined || v === null || v === "") return `${field.label} is required`;
  }
  return null;
}

// A tab is "complete" (done) the moment it has any saved data (real rows or singleton data)
// OR has been explicitly marked Not Applicable — matching the original's "any saved row,
// including the NA row, flips the badge" behavior, just without magic "NA" string values.
// Batched into 3 queries total rather than looping tabHasData per tab (was up to 21 sequential
// round-trips per status check — enough to exhaust the pool under concurrent requests).
export async function getMiCompletion(submissionId: number): Promise<{ tabKey: string; complete: boolean }[]> {
  const [naResult, rowsResult, singletonsResult] = await Promise.all([
    pool.query("select tab_key, is_not_applicable from mi_submodule_status where submission_id = $1", [submissionId]),
    pool.query("select distinct tab_key from mi_rows where submission_id = $1", [submissionId]),
    pool.query("select tab_key from mi_singletons where submission_id = $1", [submissionId]),
  ]);
  const naMap = new Map(naResult.rows.map((r) => [r.tab_key, r.is_not_applicable]));
  const tabsWithData = new Set([...rowsResult.rows.map((r) => r.tab_key), ...singletonsResult.rows.map((r) => r.tab_key)]);

  return MI_TABS.map((tab) => ({
    tabKey: tab.key,
    complete: naMap.get(tab.key) === true || tabsWithData.has(tab.key),
  }));
}

miRouter.get("/:locationCode/:monthYear/status", requireAuth, async (req, res) => {
  const locationCode = req.params.locationCode as string;
  const monthYear = req.params.monthYear as string;
  if (!checkOwnership(req.user!.role, req.user!.locationCode, locationCode)) {
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

  const [tankOpts, submission] = await Promise.all([getTankOpts(locationCode), findSubmission(locationCode, monthDate)]);
  if (!submission) {
    res.json({
      tabs: MI_TABS.map((t) => ({ key: t.key, label: t.label, isMultiRow: t.isMultiRow, complete: false })),
      allComplete: false,
      tankOpts,
    });
    return;
  }

  const completion = await getMiCompletion(submission.id);
  const tabs = MI_TABS.map((t) => ({
    key: t.key,
    label: t.label,
    isMultiRow: t.isMultiRow,
    complete: completion.find((c) => c.tabKey === t.key)?.complete ?? false,
  }));
  res.json({ tabs, allComplete: tabs.every((t) => t.complete), tankOpts });
});

miRouter.get("/:locationCode/:monthYear/:tabKey", requireAuth, async (req, res) => {
  const locationCode = req.params.locationCode as string;
  const monthYear = req.params.monthYear as string;
  const tabKey = req.params.tabKey as string;
  if (!checkOwnership(req.user!.role, req.user!.locationCode, locationCode)) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  const tab = getMiTab(tabKey);
  if (!tab) {
    res.status(400).json({ error: "Unknown M&I tab" });
    return;
  }
  let monthDate: string;
  try {
    monthDate = monthYearToDate(monthYear);
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
    return;
  }

  const tankOpts = await getTankOpts(locationCode);
  const fields = tab.fields.map((f) => (f.dynamicOpts === "tankOpts" ? { ...f, opts: tankOpts } : f));

  const submission = await findSubmission(locationCode, monthDate);
  if (!submission) {
    res.json({ label: tab.label, isMultiRow: tab.isMultiRow, naLabel: tab.naLabel, fields, isNotApplicable: false, rows: [] });
    return;
  }

  const naResult = await pool.query(
    "select is_not_applicable from mi_submodule_status where submission_id = $1 and tab_key = $2",
    [submission.id, tabKey]
  );
  const isNotApplicable = naResult.rows[0]?.is_not_applicable ?? false;

  let rows: Record<string, unknown>[] = [];
  if (tab.isMultiRow) {
    const result = await pool.query(
      "select id, row_data from mi_rows where submission_id = $1 and tab_key = $2 order by sort_order asc, id asc",
      [submission.id, tabKey]
    );
    rows = result.rows.map((r) => ({ id: r.id, ...r.row_data }));
  } else {
    const result = await pool.query("select data from mi_singletons where submission_id = $1 and tab_key = $2", [
      submission.id,
      tabKey,
    ]);
    if (result.rows[0]) rows = [result.rows[0].data];
  }

  res.json({ label: tab.label, isMultiRow: tab.isMultiRow, naLabel: tab.naLabel, fields, isNotApplicable, rows });
});

miRouter.put("/:locationCode/:monthYear/:tabKey", requireAuth, requireRole("Maker"), async (req, res) => {
  const locationCode = req.params.locationCode as string;
  const monthYear = req.params.monthYear as string;
  const tabKey = req.params.tabKey as string;
  if (!checkOwnership(req.user!.role, req.user!.locationCode, locationCode)) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  const tab = getMiTab(tabKey);
  if (!tab) {
    res.status(400).json({ error: "Unknown M&I tab" });
    return;
  }
  let monthDate: string;
  try {
    monthDate = monthYearToDate(monthYear);
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
    return;
  }

  const isNotApplicable = Boolean(req.body?.isNotApplicable);
  const rows = (req.body?.rows ?? []) as Record<string, string>[];

  if (!isNotApplicable) {
    if (!tab.isMultiRow && rows.length !== 1) {
      res.status(400).json({ error: "This tab expects exactly one record" });
      return;
    }
    if (tab.isMultiRow && rows.length === 0) {
      res.status(400).json({ error: "At least one row is required, or mark this tab Not Applicable" });
      return;
    }
    for (const row of rows) {
      const err = validateRow(tab.fields, row);
      if (err) {
        res.status(400).json({ error: err });
        return;
      }
    }
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `insert into monthly_submissions (location_code, month_year) values ($1, $2)
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

    await client.query("delete from mi_rows where submission_id = $1 and tab_key = $2", [submission.id, tabKey]);
    await client.query("delete from mi_singletons where submission_id = $1 and tab_key = $2", [submission.id, tabKey]);

    if (!isNotApplicable) {
      if (tab.isMultiRow) {
        let sortOrder = 0;
        for (const row of rows) {
          const { id: _ignored, ...rowData } = row;
          await client.query(
            "insert into mi_rows (submission_id, tab_key, row_data, sort_order) values ($1, $2, $3, $4)",
            [submission.id, tabKey, JSON.stringify(rowData), sortOrder++]
          );
        }
      } else {
        const { id: _ignored, ...rowData } = rows[0];
        await client.query(
          "insert into mi_singletons (submission_id, tab_key, data) values ($1, $2, $3)",
          [submission.id, tabKey, JSON.stringify(rowData)]
        );
      }
    }

    await client.query(
      `insert into mi_submodule_status (submission_id, tab_key, is_not_applicable, updated_at)
       values ($1, $2, $3, now())
       on conflict (submission_id, tab_key) do update set is_not_applicable = excluded.is_not_applicable, updated_at = now()`,
      [submission.id, tabKey, isNotApplicable]
    );
    await client.query("update monthly_submissions set last_updated_at = now() where id = $1", [submission.id]);

    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (e) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: "Failed to save", message: (e as Error).message });
  } finally {
    client.release();
  }
});
