import { Router, Request } from "express";
import { pool } from "../db/pool";
import { requireAuth } from "../middleware/requireAuth";
import { SECTION_FIELDS, SECTION_NAMES, getExcludedFields } from "../formDefs";

export const fieldDefsRouter = Router();

// Field visibility (which fields are N/A for TOP/HMEL) depends on the location being VIEWED,
// not the caller's own location — matters when Admin/Zone/Viewer look at another location's
// data via "View", since they have no location of their own to infer from.
async function resolveLocType(req: Request, targetLocationCode: string | undefined): Promise<string | null> {
  if (!targetLocationCode) return "HPCL";
  const user = req.user!;
  const authorized =
    user.role === "Admin" ||
    user.role === "Viewer" ||
    targetLocationCode === user.locationCode ||
    (user.role === "Zone" &&
      (await pool.query("select 1 from locations where code = $1 and zone_id = $2", [targetLocationCode, user.zoneId])).rowCount);
  if (!authorized) return null;
  const result = await pool.query("select loc_type from locations where code = $1", [targetLocationCode]);
  return result.rows[0]?.loc_type ?? "HPCL";
}

fieldDefsRouter.get("/:sectionNo", requireAuth, async (req, res) => {
  const sectionNum = Number(req.params.sectionNo);
  const fields = SECTION_FIELDS[sectionNum];
  if (!fields) {
    res.status(404).json({ error: "Unknown section" });
    return;
  }

  const targetLocationCode = (req.query.locationCode as string | undefined) || req.user!.locationCode || undefined;
  const locType = await resolveLocType(req, targetLocationCode);
  if (locType === null) {
    res.status(403).json({ error: "forbidden" });
    return;
  }

  const excluded = getExcludedFields(locType);
  const visibleFields = fields.filter((f) => !excluded.has(f.key));

  res.json({
    sectionNo: sectionNum,
    sectionName: SECTION_NAMES[sectionNum],
    locType,
    fields: visibleFields,
  });
});

// Bulk variant: all 10 sections' field defs in one request — used by LocationReviewPanel,
// which renders all 10 sections at once and would otherwise fire 10 separate requests.
fieldDefsRouter.get("/", requireAuth, async (req, res) => {
  const targetLocationCode = (req.query.locationCode as string | undefined) || req.user!.locationCode || undefined;
  const locType = await resolveLocType(req, targetLocationCode);
  if (locType === null) {
    res.status(403).json({ error: "forbidden" });
    return;
  }

  const excluded = getExcludedFields(locType);
  const sections: Record<number, { sectionNo: number; sectionName: string; locType: string; fields: typeof SECTION_FIELDS[number] }> = {};
  for (const [sectionNoStr, fields] of Object.entries(SECTION_FIELDS)) {
    const sectionNum = Number(sectionNoStr);
    sections[sectionNum] = {
      sectionNo: sectionNum,
      sectionName: SECTION_NAMES[sectionNum],
      locType,
      fields: fields.filter((f) => !excluded.has(f.key)),
    };
  }

  res.json({ sections });
});
