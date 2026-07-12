import { Router } from "express";
import { pool } from "../db/pool";
import { requireAuth } from "../middleware/requireAuth";

export const analyticsRouter = Router();

function fyMonths(fyStartYear: number): string[] {
  // April fyStartYear -> March fyStartYear+1, as "YYYY-MM-01" dates.
  const months: string[] = [];
  for (let i = 0; i < 12; i++) {
    const monthNum = ((i + 3) % 12) + 1; // 0->4(Apr) ... 8->12(Dec), 9->1(Jan)...
    const year = i < 9 ? fyStartYear : fyStartYear + 1;
    months.push(`${year}-${String(monthNum).padStart(2, "0")}-01`);
  }
  return months;
}

function scopeClause(user: { role: string; locationCode: string | null; zoneId: number | null }): {
  clause: string;
  params: unknown[];
} {
  if (user.role === "Admin" || user.role === "Viewer") return { clause: "true", params: [] };
  if (user.role === "Zone") return { clause: "l.zone_id = $1", params: [user.zoneId] };
  return { clause: "l.code = $1", params: [user.locationCode] };
}

analyticsRouter.get("/field-data", requireAuth, async (req, res) => {
  const fyStartYear = Number(req.query.fyStartYear);
  const fields = ((req.query.fields as string) ?? "").split(",").filter(Boolean);
  if (!fyStartYear || fields.length === 0) {
    res.status(400).json({ error: "fyStartYear and fields are required" });
    return;
  }
  const months = fyMonths(fyStartYear);
  const { clause, params } = scopeClause(req.user!);

  const result = await pool.query(
    `select l.code as location_code, l.name as location_name, z.name as zone_name,
            ms.month_year, fv.field_key, fv.value
     from monthly_submissions ms
     join locations l on l.code = ms.location_code
     left join zones z on z.id = l.zone_id
     join field_values fv on fv.submission_id = ms.id
     where ${clause}
       and ms.month_year = any($${params.length + 1}::date[])
       and fv.field_key = any($${params.length + 2}::text[])
     order by l.name, ms.month_year`,
    [...params, months, fields]
  );

  const rowMap = new Map<string, { locationCode: string; locationName: string; zoneName: string | null; monthYear: string; values: Record<string, string> }>();
  for (const r of result.rows) {
    const key = `${r.location_code}|${r.month_year}`;
    if (!rowMap.has(key)) {
      rowMap.set(key, {
        locationCode: r.location_code,
        locationName: r.location_name,
        zoneName: r.zone_name,
        monthYear: r.month_year,
        values: {},
      });
    }
    rowMap.get(key)!.values[r.field_key] = r.value;
  }

  res.json({ months, rows: Array.from(rowMap.values()) });
});

analyticsRouter.get("/compliance", requireAuth, async (req, res) => {
  const fyStartYear = Number(req.query.fyStartYear);
  if (!fyStartYear) {
    res.status(400).json({ error: "fyStartYear is required" });
    return;
  }
  const months = fyMonths(fyStartYear);
  const { clause, params } = scopeClause(req.user!);

  const locResult = await pool.query(
    `select l.code as location_code, l.name as location_name from locations l where ${clause} and l.active = true order by l.name`,
    params
  );
  const subResult = await pool.query(
    `select l.code as location_code, ms.month_year, ms.status
     from monthly_submissions ms
     join locations l on l.code = ms.location_code
     where ${clause} and ms.month_year = any($${params.length + 1}::date[])`,
    [...params, months]
  );

  const statusMap = new Map<string, string>();
  for (const r of subResult.rows) {
    statusMap.set(`${r.location_code}|${r.month_year}`, r.status);
  }

  const heatmap = locResult.rows.flatMap((loc) =>
    months.map((m) => ({
      locationCode: loc.location_code,
      locationName: loc.location_name,
      monthYear: m,
      status: statusMap.get(`${loc.location_code}|${m}`) ?? "NOT_STARTED",
    }))
  );

  const monthlyCompliance = months.map((m) => {
    const total = locResult.rows.length;
    const submitted = locResult.rows.filter((loc) => statusMap.get(`${loc.location_code}|${m}`) === "SUBMITTED").length;
    return { monthYear: m, totalLocations: total, submittedCount: submitted, pct: total > 0 ? Math.round((submitted / total) * 100) : 0 };
  });

  const leaderboard = locResult.rows
    .map((loc) => {
      const submittedCount = months.filter((m) => statusMap.get(`${loc.location_code}|${m}`) === "SUBMITTED").length;
      return {
        locationCode: loc.location_code,
        locationName: loc.location_name,
        submittedCount,
        totalMonths: months.length,
        pct: Math.round((submittedCount / months.length) * 100),
      };
    })
    .sort((a, b) => b.pct - a.pct);

  res.json({ months, heatmap, monthlyCompliance, leaderboard });
});
