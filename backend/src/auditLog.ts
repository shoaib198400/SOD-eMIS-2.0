import { pool } from "./db/pool";

// Best-effort, matching the original app's audit_log() — never let a logging failure break
// the actual request. Richer than the original's free-text-only row: entity_type/entity_id/
// details(jsonb) make "who touched submission X" queryable instead of string-parsing later.
export async function logAudit(params: {
  actorUserId?: number | null;
  actorLocationCode?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  try {
    await pool.query(
      `insert into audit_log (actor_user_id, actor_location_code, action, entity_type, entity_id, details)
       values ($1, $2, $3, $4, $5, $6)`,
      [
        params.actorUserId ?? null,
        params.actorLocationCode ?? null,
        params.action,
        params.entityType ?? null,
        params.entityId ?? null,
        params.details ? JSON.stringify(params.details) : null,
      ]
    );
  } catch (e) {
    console.error("audit log write failed:", (e as Error).message);
  }
}
