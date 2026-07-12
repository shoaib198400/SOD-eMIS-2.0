import { Router } from "express";
import ExcelJS from "exceljs";
import { pool } from "../db/pool";
import { requireAuth, requireRole } from "../middleware/requireAuth";
import { SECTION_FIELDS } from "../formDefs";

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

// Blank fill-offline template: one sheet per MIS section listing every field the
// Maker needs to supply. There's no matching upload/parse endpoint yet — this is
// for reference while filling the form online, not a round-trip upload workflow.
exportsRouter.get("/blank-template", requireAuth, async (_req, res) => {
  const workbook = new ExcelJS.Workbook();
  for (const [sectionNo, fields] of Object.entries(SECTION_FIELDS)) {
    const sheet = workbook.addWorksheet(`S${sectionNo}`);
    sheet.addRow(["Field No.", "Label", "Value"]).font = { bold: true };
    for (const field of fields) sheet.addRow([field.no, field.label, ""]);
    sheet.columns = [{ width: 10 }, { width: 50 }, { width: 20 }];
  }
  await sendWorkbook(res, workbook, "MIS_Blank_Template.xlsx");
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
