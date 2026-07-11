import { Router } from "express";
import { pool } from "../db/pool";
import { requireAuth } from "../middleware/requireAuth";
import { SECTION_FIELDS, SECTION_NAMES, getExcludedFields } from "../formDefs";

export const fieldDefsRouter = Router();

fieldDefsRouter.get("/:sectionNo", requireAuth, async (req, res) => {
  const sectionNum = Number(req.params.sectionNo);
  const fields = SECTION_FIELDS[sectionNum];
  if (!fields) {
    res.status(404).json({ error: "Unknown section" });
    return;
  }

  let locType = "HPCL";
  if (req.user!.locationCode) {
    const result = await pool.query("select loc_type from locations where code = $1", [req.user!.locationCode]);
    if (result.rows[0]) locType = result.rows[0].loc_type;
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
