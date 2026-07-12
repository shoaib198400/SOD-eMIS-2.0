import { Router } from "express";
import ExcelJS from "exceljs";
import { pool } from "../db/pool";
import { requireAuth, requireRole } from "../middleware/requireAuth";
import { SECTION_FIELDS, SECTION_NAMES, getExcludedFields, getSkipSections } from "../formDefs";
import { MI_TABS } from "../miDefs";
import { evaluateAutoCalc } from "../autoCalc";

export const exportsRouter = Router();

function scopeClause(user: { role: string; locationCode: string | null; zoneId: number | null }): {
  clause: string;
  params: unknown[];
} {
  if (user.role === "Admin" || user.role === "Viewer") return { clause: "true", params: [] };
  if (user.role === "Zone") return { clause: "l.zone_id = $1", params: [user.zoneId] };
  return { clause: "l.code = $1", params: [user.locationCode] };
}

function monthYearToDate(monthYear: string): string {
  if (!/^\d{4}-\d{2}$/.test(monthYear)) throw new Error("monthYear must be in YYYY-MM format");
  return `${monthYear}-01`;
}

async function sendWorkbook(res: import("express").Response, workbook: ExcelJS.Workbook, filename: string) {
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  await workbook.xlsx.write(res);
  res.end();
}

// Field label lookup, e.g. "f1" -> "MS (MT)".
const FIELD_LABELS: Record<string, string> = {};
for (const fields of Object.values(SECTION_FIELDS)) {
  for (const field of fields) FIELD_LABELS[field.key] = field.label;
}

function checkOwnership(user: { role: string; locationCode: string | null }, locationCode: string): boolean {
  return user.role === "Admin" || user.role === "Viewer" || user.locationCode === locationCode;
}

async function getLocationRow(locationCode: string): Promise<{ loc_type: string; name: string; zone_name: string | null } | null> {
  const result = await pool.query(
    `select l.loc_type, l.name, z.name as zone_name from locations l left join zones z on z.id = l.zone_id where l.code = $1`,
    [locationCode]
  );
  return result.rows[0] ?? null;
}

async function findSubmissionId(locationCode: string, monthDate: string): Promise<number | null> {
  const result = await pool.query(
    "select id from monthly_submissions where location_code = $1 and month_year = $2",
    [locationCode, monthDate]
  );
  return result.rows[0]?.id ?? null;
}

async function loadValuesWithAutoCalc(submissionId: number | null): Promise<Record<string, string>> {
  const raw: Record<string, string> = {};
  if (submissionId) {
    const result = await pool.query("select field_key, value from field_values where submission_id = $1", [submissionId]);
    for (const row of result.rows) raw[row.field_key] = row.value;
  }
  const merged: Record<string, string> = { ...raw };
  for (const fields of Object.values(SECTION_FIELDS)) {
    for (const field of fields) {
      if (!field.auto) continue;
      const computed = evaluateAutoCalc(field.auto, merged);
      merged[field.key] = computed === null ? "" : computed.toFixed(field.dec ?? 2);
    }
  }
  return merged;
}

// Builds the 10 M&I subsection sheets (shared by the full template and the standalone
// M&I-only report). `submissionId` null means "no draft yet" -> sheets get only headers.
async function addMiSheets(workbook: ExcelJS.Workbook, submissionId: number | null) {
  const naMap = new Map<string, boolean>();
  if (submissionId) {
    const naResult = await pool.query(
      "select tab_key, is_not_applicable from mi_submodule_status where submission_id = $1",
      [submissionId]
    );
    for (const row of naResult.rows) naMap.set(row.tab_key, row.is_not_applicable);
  }

  for (const tab of MI_TABS) {
    const sheet = workbook.addWorksheet(`S5A ${tab.label}`.slice(0, 31));
    const isNA = naMap.get(tab.key) === true;
    if (isNA) {
      sheet.addRow([tab.naLabel]).font = { bold: true, italic: true };
      continue;
    }

    let rows: Record<string, unknown>[] = [];
    if (submissionId) {
      if (tab.isMultiRow) {
        const result = await pool.query(
          "select row_data from mi_rows where submission_id = $1 and tab_key = $2 order by sort_order asc, id asc",
          [submissionId, tab.key]
        );
        rows = result.rows.map((r) => r.row_data);
      } else {
        const result = await pool.query("select data from mi_singletons where submission_id = $1 and tab_key = $2", [
          submissionId,
          tab.key,
        ]);
        if (result.rows[0]) rows = [result.rows[0].data];
      }
    }

    sheet.addRow(tab.fields.map((f) => f.label)).font = { bold: true };
    for (const row of rows) sheet.addRow(tab.fields.map((f) => (row[f.key] ?? "") as string));
    sheet.columns.forEach((col) => (col.width = 22));
  }
}

// Full monthwise MIS workbook for one location: all 10 sections (values as currently saved,
// blank if not yet started) + the M&I subsection sheets. This is the "Excel Template" download
// from the Maker dashboard — a snapshot of the current draft, not a blank form.
exportsRouter.get("/mis-template/:locationCode/:monthYear", requireAuth, async (req, res) => {
  const locationCode = req.params.locationCode as string;
  const monthYear = req.params.monthYear as string;
  if (!checkOwnership(req.user!, locationCode)) {
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

  const location = await getLocationRow(locationCode);
  if (!location) {
    res.status(404).json({ error: "Unknown location" });
    return;
  }
  const submissionId = await findSubmissionId(locationCode, monthDate);
  const values = await loadValuesWithAutoCalc(submissionId);
  const excluded = getExcludedFields(location.loc_type);
  const skipSections = getSkipSections(location.loc_type);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("MIS Data");
  sheet.addRow([`${location.name} (${locationCode})`, `Zone: ${location.zone_name ?? "—"}`, `Period: ${monthYear}`]).font = {
    bold: true,
  };
  sheet.addRow([]);

  for (const [sectionNoStr, fields] of Object.entries(SECTION_FIELDS)) {
    const sectionNo = Number(sectionNoStr);
    const naSuffix = skipSections.has(sectionNo) ? " (N/A for this location type)" : "";
    sheet.addRow([`${SECTION_NAMES[sectionNo]}${naSuffix}`]).font = { bold: true, color: { argb: "FF001F5E" } };
    for (const field of fields) {
      const isExcluded = excluded.has(field.key);
      const label = `${field.label}${field.auto ? " [Auto-Calc]" : ""}${isExcluded ? " (N/A)" : ""}`;
      sheet.addRow([label, isExcluded ? "" : values[field.key] ?? ""]);
    }
    sheet.addRow([]);
  }
  sheet.getColumn(1).width = 55;
  sheet.getColumn(2).width = 25;

  // Detail tables (Railway Claims / IRR Details / Legal Cases), only if any rows exist.
  if (submissionId) {
    const detailTypes: { type: string; sheetName: string }[] = [
      { type: "RAILWAY_CLAIM", sheetName: "Railway Claims" },
      { type: "IRR_DETAIL", sheetName: "IRR Details" },
      { type: "LEGAL_CASE", sheetName: "Legal Cases" },
    ];
    for (const { type, sheetName } of detailTypes) {
      const result = await pool.query(
        "select row_data from detail_rows where submission_id = $1 and table_type = $2 order by sort_order asc, id asc",
        [submissionId, type]
      );
      if (result.rows.length === 0) continue;
      const detailSheet = workbook.addWorksheet(sheetName);
      const keys = Array.from(new Set(result.rows.flatMap((r) => Object.keys(r.row_data))));
      detailSheet.addRow(keys).font = { bold: true };
      for (const row of result.rows) detailSheet.addRow(keys.map((k) => row.row_data[k] ?? ""));
      detailSheet.columns.forEach((col) => (col.width = 20));
    }
  }

  await addMiSheets(workbook, submissionId);

  await sendWorkbook(res, workbook, `MIS_${locationCode}_${monthYear}.xlsx`);
});

// Standalone M&I MIS report for one location/month — just the 10 M&I subsection sheets plus
// a cover sheet, matching the original's "Generate M&I Report" button on the M&I MIS page.
exportsRouter.get("/mi-report/:locationCode/:monthYear", requireAuth, async (req, res) => {
  const locationCode = req.params.locationCode as string;
  const monthYear = req.params.monthYear as string;
  if (!checkOwnership(req.user!, locationCode)) {
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

  const location = await getLocationRow(locationCode);
  if (!location) {
    res.status(404).json({ error: "Unknown location" });
    return;
  }
  const submissionId = await findSubmissionId(locationCode, monthDate);

  const workbook = new ExcelJS.Workbook();
  const cover = workbook.addWorksheet("Cover");
  cover.addRow(["M&I MIS Report"]).font = { bold: true, size: 14 };
  cover.addRow(["Location", `${location.name} (${locationCode})`]);
  cover.addRow(["Zone", location.zone_name ?? "—"]);
  cover.addRow(["Period", monthYear]);
  cover.getColumn(1).width = 16;
  cover.getColumn(2).width = 35;

  await addMiSheets(workbook, submissionId);

  await sendWorkbook(res, workbook, `MI_MIS_${locationCode}_${monthYear}.xlsx`);
});

// Consolidated M&I MIS across ALL locations for one month (Admin/Viewer only) — one sheet per
// M&I tab, stacking every SUBMITTED location's rows for that month with Zone/Location columns.
exportsRouter.get("/consolidated-mi", requireAuth, requireRole("Admin", "Viewer"), async (req, res) => {
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

  const submissions = await pool.query(
    `select ms.id as submission_id, l.code as location_code, l.name as location_name, z.name as zone_name
     from monthly_submissions ms
     join locations l on l.code = ms.location_code
     left join zones z on z.id = l.zone_id
     where ms.month_year = $1 and ms.status = 'SUBMITTED' and l.loc_type = 'HPCL'
     order by l.name`,
    [monthDate]
  );

  const workbook = new ExcelJS.Workbook();
  for (const tab of MI_TABS) {
    const sheet = workbook.addWorksheet(`S5A ${tab.label}`.slice(0, 31));
    sheet.addRow(["Zone", "Location Code", "Location Name", ...tab.fields.map((f) => f.label)]).font = { bold: true };

    for (const sub of submissions.rows) {
      const naResult = await pool.query(
        "select is_not_applicable from mi_submodule_status where submission_id = $1 and tab_key = $2",
        [sub.submission_id, tab.key]
      );
      if (naResult.rows[0]?.is_not_applicable) continue;

      let rows: Record<string, unknown>[] = [];
      if (tab.isMultiRow) {
        const result = await pool.query(
          "select row_data from mi_rows where submission_id = $1 and tab_key = $2 order by sort_order asc, id asc",
          [sub.submission_id, tab.key]
        );
        rows = result.rows.map((r) => r.row_data);
      } else {
        const result = await pool.query("select data from mi_singletons where submission_id = $1 and tab_key = $2", [
          sub.submission_id,
          tab.key,
        ]);
        if (result.rows[0]) rows = [result.rows[0].data];
      }
      for (const row of rows) {
        sheet.addRow([sub.zone_name, sub.location_code, sub.location_name, ...tab.fields.map((f) => (row[f.key] ?? "") as string)]);
      }
    }
    sheet.columns.forEach((col) => (col.width = 20));
  }

  await sendWorkbook(res, workbook, `Consolidated_MI_MIS_${monthYear}.xlsx`);
});

exportsRouter.get("/submitted-data", requireAuth, async (req, res) => {
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
  const { clause, params } = scopeClause(req.user!);

  const result = await pool.query(
    `select l.code as location_code, l.name as location_name, z.name as zone_name,
            aps.snapshot, aps.approved_at
     from approved_snapshots aps
     join monthly_submissions ms on ms.id = aps.submission_id
     join locations l on l.code = ms.location_code
     left join zones z on z.id = l.zone_id
     where ${clause} and ms.month_year = $${params.length + 1}::date
     order by l.name`,
    [...params, monthDate]
  );

  const allKeys = new Set<string>();
  for (const row of result.rows) for (const k of Object.keys(row.snapshot)) allKeys.add(k);
  const fieldKeys = Array.from(allKeys).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Submitted Data");
  sheet.addRow(["Location Code", "Location Name", "Zone", "Approved At", ...fieldKeys.map((k) => FIELD_LABELS[k] ?? k)]).font = { bold: true };
  for (const row of result.rows) {
    sheet.addRow([
      row.location_code,
      row.location_name,
      row.zone_name,
      row.approved_at,
      ...fieldKeys.map((k) => row.snapshot[k] ?? ""),
    ]);
  }
  sheet.columns.forEach((col) => (col.width = 16));

  await sendWorkbook(res, workbook, `Submitted_MIS_${monthYear}.xlsx`);
});

exportsRouter.get("/pending-list", requireAuth, async (req, res) => {
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
  const { clause, params } = scopeClause(req.user!);

  const result = await pool.query(
    `select l.code as location_code, l.name as location_name, z.name as zone_name,
            coalesce(ms.status, 'NOT_STARTED') as status, coalesce(ms.completion_pct, 0) as completion_pct
     from locations l
     left join zones z on z.id = l.zone_id
     left join monthly_submissions ms on ms.location_code = l.code and ms.month_year = $${params.length + 1}::date
     where ${clause} and l.active = true and coalesce(ms.status, 'NOT_STARTED') != 'SUBMITTED'
     order by l.name`,
    [...params, monthDate]
  );

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Pending Locations");
  sheet.addRow(["Location Code", "Location Name", "Zone", "Status", "Completion %"]).font = { bold: true };
  for (const row of result.rows) {
    sheet.addRow([row.location_code, row.location_name, row.zone_name, row.status, Number(row.completion_pct)]);
  }
  sheet.columns.forEach((col) => (col.width = 20));

  await sendWorkbook(res, workbook, `Pending_MIS_${monthYear}.xlsx`);
});

exportsRouter.get("/tank-master", requireAuth, async (req, res) => {
  const { clause, params } = scopeClause(req.user!);
  const result = await pool.query(
    `select tm.location_code, l.name as location_name, tm.tank_no
     from tank_master tm
     join locations l on l.code = tm.location_code
     where ${clause}
     order by l.name, tm.tank_no`,
    params
  );

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Tank Master");
  sheet.addRow(["Location Code", "Location Name", "Tank No."]).font = { bold: true };
  for (const row of result.rows) sheet.addRow([row.location_code, row.location_name, row.tank_no]);
  sheet.columns.forEach((col) => (col.width = 20));

  await sendWorkbook(res, workbook, "Tank_Master.xlsx");
});

// Full FY consolidated export: one row per (location, month) with every field value,
// pulled from approved snapshots only (i.e. finalized data), across all 12 FY months.
exportsRouter.get("/consolidated-fy", requireAuth, requireRole("Admin", "Viewer"), async (req, res) => {
  const fyStartYear = Number(req.query.fyStartYear);
  if (!fyStartYear) {
    res.status(400).json({ error: "fyStartYear is required" });
    return;
  }
  const months: string[] = [];
  for (let i = 0; i < 12; i++) {
    const monthNum = ((i + 3) % 12) + 1;
    const year = i < 9 ? fyStartYear : fyStartYear + 1;
    months.push(`${year}-${String(monthNum).padStart(2, "0")}-01`);
  }

  const result = await pool.query(
    `select l.code as location_code, l.name as location_name, z.name as zone_name,
            ms.month_year, aps.snapshot
     from approved_snapshots aps
     join monthly_submissions ms on ms.id = aps.submission_id
     join locations l on l.code = ms.location_code
     left join zones z on z.id = l.zone_id
     where ms.month_year = any($1::date[])
     order by l.name, ms.month_year`,
    [months]
  );

  const allKeys = new Set<string>();
  for (const row of result.rows) for (const k of Object.keys(row.snapshot)) allKeys.add(k);
  const fieldKeys = Array.from(allKeys).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Full MIS Data");
  sheet.addRow(["Location Code", "Location Name", "Zone", "Month", ...fieldKeys.map((k) => FIELD_LABELS[k] ?? k)]).font = { bold: true };
  for (const row of result.rows) {
    sheet.addRow([
      row.location_code,
      row.location_name,
      row.zone_name,
      row.month_year,
      ...fieldKeys.map((k) => row.snapshot[k] ?? ""),
    ]);
  }
  sheet.columns.forEach((col) => (col.width = 16));

  await sendWorkbook(res, workbook, `Full_MIS_FY${fyStartYear}-${String(fyStartYear + 1).slice(2)}.xlsx`);
});
